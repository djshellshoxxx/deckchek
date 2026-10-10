//! Test-only PDF text extraction for FS-03 AC-2 ("Page 2 of" on page 2).
//!
//! The spec names the `lopdf` dev-dependency, but feature jobs may not edit `Cargo.toml`
//! (FS-00 §3: only a milestone's wave-0 foundation job adds crates). This module covers
//! exactly what Chromium/Skia (WebView2 `PrintToPdf`, Chrome "Save as PDF") writes: classic
//! or compressed object storage, FlateDecode streams, Type0/Identity-H fonts with
//! `ToUnicode` CMaps, simple fonts and form XObjects. It is compiled only for tests.

use std::collections::HashMap;

// ---------------------------------------------------------------- inflate (RFC 1951)

struct BitReader<'a> {
    data: &'a [u8],
    pos: usize,
    bit_buf: u32,
    bit_cnt: u32,
}

impl<'a> BitReader<'a> {
    fn bits(&mut self, need: u32) -> Result<u32, String> {
        while self.bit_cnt < need {
            let b = *self.data.get(self.pos).ok_or("inflate: unexpected end of data")?;
            self.pos += 1;
            self.bit_buf |= (b as u32) << self.bit_cnt;
            self.bit_cnt += 8;
        }
        let v = self.bit_buf & ((1u32 << need) - 1);
        self.bit_buf >>= need;
        self.bit_cnt -= need;
        Ok(v)
    }
}

struct Huffman {
    count: [u16; 16],
    symbol: Vec<u16>,
}

impl Huffman {
    fn new(lengths: &[u8]) -> Self {
        let mut count = [0u16; 16];
        for &l in lengths {
            count[l as usize] += 1;
        }
        count[0] = 0;
        let mut offs = [0u16; 16];
        for len in 1..16 {
            offs[len] = offs[len - 1] + count[len - 1];
        }
        let mut symbol = vec![0u16; lengths.len()];
        for (sym, &l) in lengths.iter().enumerate() {
            if l != 0 {
                symbol[offs[l as usize] as usize] = sym as u16;
                offs[l as usize] += 1;
            }
        }
        Self { count, symbol }
    }

    fn decode(&self, br: &mut BitReader) -> Result<u16, String> {
        let (mut code, mut first, mut index) = (0i32, 0i32, 0i32);
        for len in 1..16 {
            code |= br.bits(1)? as i32;
            let count = self.count[len] as i32;
            if code - count < first {
                return self.symbol.get((index + (code - first)) as usize).copied().ok_or_else(|| "inflate: bad code".into());
            }
            index += count;
            first = (first + count) << 1;
            code <<= 1;
        }
        Err("inflate: code too long".into())
    }
}

const LEN_BASE: [u16; 29] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA: [u8; 29] = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE: [u16; 30] = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA: [u8; 30] = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

fn inflate_block(br: &mut BitReader, out: &mut Vec<u8>, lit: &Huffman, dist: &Huffman) -> Result<(), String> {
    loop {
        let sym = lit.decode(br)?;
        match sym {
            0..=255 => out.push(sym as u8),
            256 => return Ok(()),
            _ => {
                let i = (sym - 257) as usize;
                if i >= 29 {
                    return Err("inflate: bad length symbol".into());
                }
                let len = LEN_BASE[i] as usize + br.bits(LEN_EXTRA[i] as u32)? as usize;
                let d = dist.decode(br)? as usize;
                if d >= 30 {
                    return Err("inflate: bad distance symbol".into());
                }
                let back = DIST_BASE[d] as usize + br.bits(DIST_EXTRA[d] as u32)? as usize;
                if back > out.len() {
                    return Err("inflate: distance too far back".into());
                }
                let start = out.len() - back;
                for k in 0..len {
                    out.push(out[start + k]);
                }
            }
        }
    }
}

/// Raw DEFLATE decoder (stored, fixed and dynamic Huffman blocks).
pub fn inflate(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut br = BitReader { data, pos: 0, bit_buf: 0, bit_cnt: 0 };
    let mut out = Vec::with_capacity(data.len() * 4);
    loop {
        let last = br.bits(1)?;
        match br.bits(2)? {
            0 => {
                br.bit_buf = 0;
                br.bit_cnt = 0;
                let hdr = data.get(br.pos..br.pos + 4).ok_or("inflate: truncated stored block")?;
                let len = u16::from_le_bytes([hdr[0], hdr[1]]) as usize;
                if len != !u16::from_le_bytes([hdr[2], hdr[3]]) as usize {
                    return Err("inflate: stored length mismatch".into());
                }
                br.pos += 4;
                out.extend_from_slice(data.get(br.pos..br.pos + len).ok_or("inflate: truncated stored data")?);
                br.pos += len;
            }
            1 => {
                let mut l = [0u8; 288];
                l[..144].fill(8);
                l[144..256].fill(9);
                l[256..280].fill(7);
                l[280..].fill(8);
                inflate_block(&mut br, &mut out, &Huffman::new(&l), &Huffman::new(&[5u8; 30]))?;
            }
            2 => {
                let nlen = br.bits(5)? as usize + 257;
                let ndist = br.bits(5)? as usize + 1;
                let ncode = br.bits(4)? as usize + 4;
                const ORDER: [usize; 19] = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
                let mut cl = [0u8; 19];
                for &o in ORDER.iter().take(ncode) {
                    cl[o] = br.bits(3)? as u8;
                }
                let clh = Huffman::new(&cl);
                let mut lengths = Vec::with_capacity(nlen + ndist);
                while lengths.len() < nlen + ndist {
                    let sym = clh.decode(&mut br)?;
                    let (val, rep) = match sym {
                        0..=15 => (sym as u8, 1),
                        16 => (*lengths.last().ok_or("inflate: repeat without length")?, 3 + br.bits(2)? as usize),
                        17 => (0, 3 + br.bits(3)? as usize),
                        _ => (0, 11 + br.bits(7)? as usize),
                    };
                    lengths.extend(std::iter::repeat_n(val, rep));
                }
                if lengths.len() > nlen + ndist {
                    return Err("inflate: too many lengths".into());
                }
                inflate_block(&mut br, &mut out, &Huffman::new(&lengths[..nlen]), &Huffman::new(&lengths[nlen..]))?;
            }
            _ => return Err("inflate: bad block type".into()),
        }
        if last == 1 {
            return Ok(out);
        }
    }
}

/// zlib wrapper (RFC 1950) around [`inflate`]; the Adler-32 trailer is not checked.
pub fn zlib_decompress(data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 2 || data[0] & 0x0f != 8 || !((data[0] as u16) << 8 | data[1] as u16).is_multiple_of(31) {
        return Err("zlib: bad header".into());
    }
    if data[1] & 0x20 != 0 {
        return Err("zlib: preset dictionary not supported".into());
    }
    inflate(&data[2..])
}

// ---------------------------------------------------------------- lexer / objects

#[derive(Debug, Clone, PartialEq)]
pub enum Val {
    Num(f64),
    Name(String),
    Str(Vec<u8>),
    Arr(Vec<Val>),
    Dict(Vec<(String, Val)>),
    Ref(u32),
    Kw(String),
}

impl Val {
    pub fn get(&self, key: &str) -> Option<&Val> {
        match self {
            Val::Dict(d) => d.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }
    fn name(&self) -> Option<&str> {
        match self {
            Val::Name(n) => Some(n),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Val(Val),
    ArrOpen,
    ArrClose,
    DictOpen,
    DictClose,
}

fn is_ws(b: u8) -> bool {
    matches!(b, b' ' | b'\n' | b'\r' | b'\t' | b'\x0c' | b'\0')
}
fn is_delim(b: u8) -> bool {
    matches!(b, b'(' | b')' | b'<' | b'>' | b'[' | b']' | b'{' | b'}' | b'/' | b'%')
}

struct Lexer<'a> {
    d: &'a [u8],
    pos: usize,
}

impl<'a> Lexer<'a> {
    fn new(d: &'a [u8], pos: usize) -> Self {
        Self { d, pos }
    }

    fn skip_ws(&mut self) {
        while self.pos < self.d.len() {
            let b = self.d[self.pos];
            if is_ws(b) {
                self.pos += 1;
            } else if b == b'%' {
                while self.pos < self.d.len() && !matches!(self.d[self.pos], b'\n' | b'\r') {
                    self.pos += 1;
                }
            } else {
                break;
            }
        }
    }

    fn regular(&mut self) -> &'a [u8] {
        let s = self.pos;
        while self.pos < self.d.len() && !is_ws(self.d[self.pos]) && !is_delim(self.d[self.pos]) {
            self.pos += 1;
        }
        &self.d[s..self.pos]
    }

    fn next(&mut self) -> Option<Tok> {
        self.skip_ws();
        let b = *self.d.get(self.pos)?;
        Some(match b {
            b'[' => {
                self.pos += 1;
                Tok::ArrOpen
            }
            b']' => {
                self.pos += 1;
                Tok::ArrClose
            }
            b'<' if self.d.get(self.pos + 1) == Some(&b'<') => {
                self.pos += 2;
                Tok::DictOpen
            }
            b'>' if self.d.get(self.pos + 1) == Some(&b'>') => {
                self.pos += 2;
                Tok::DictClose
            }
            b'<' => {
                self.pos += 1;
                let mut nib = Vec::new();
                while let Some(&c) = self.d.get(self.pos) {
                    self.pos += 1;
                    if c == b'>' {
                        break;
                    }
                    if let Some(v) = (c as char).to_digit(16) {
                        nib.push(v as u8);
                    }
                }
                if nib.len() % 2 == 1 {
                    nib.push(0);
                }
                Tok::Val(Val::Str(nib.chunks(2).map(|p| p[0] << 4 | p[1]).collect()))
            }
            b'(' => Tok::Val(Val::Str(self.literal())),
            b'/' => {
                self.pos += 1;
                let raw = self.regular();
                let mut name = Vec::with_capacity(raw.len());
                let mut i = 0;
                while i < raw.len() {
                    if raw[i] == b'#' && i + 2 < raw.len() {
                        if let Ok(v) = u8::from_str_radix(std::str::from_utf8(&raw[i + 1..i + 3]).unwrap_or("x"), 16) {
                            name.push(v);
                            i += 3;
                            continue;
                        }
                    }
                    name.push(raw[i]);
                    i += 1;
                }
                Tok::Val(Val::Name(String::from_utf8_lossy(&name).into_owned()))
            }
            b'{' | b'}' | b')' | b'>' => {
                self.pos += 1;
                Tok::Val(Val::Kw((b as char).to_string()))
            }
            _ => {
                let raw = self.regular();
                let s = String::from_utf8_lossy(raw).into_owned();
                match s.parse::<f64>() {
                    Ok(n) if raw.first().is_some_and(|c| c.is_ascii_digit() || matches!(c, b'+' | b'-' | b'.')) => Tok::Val(Val::Num(n)),
                    _ => Tok::Val(Val::Kw(s)),
                }
            }
        })
    }

    fn literal(&mut self) -> Vec<u8> {
        self.pos += 1;
        let mut out = Vec::new();
        let mut depth = 1;
        while let Some(&c) = self.d.get(self.pos) {
            self.pos += 1;
            match c {
                b'(' => {
                    depth += 1;
                    out.push(c);
                }
                b')' => {
                    depth -= 1;
                    if depth == 0 {
                        break;
                    }
                    out.push(c);
                }
                b'\\' => {
                    let Some(&e) = self.d.get(self.pos) else { break };
                    self.pos += 1;
                    match e {
                        b'n' => out.push(b'\n'),
                        b'r' => out.push(b'\r'),
                        b't' => out.push(b'\t'),
                        b'b' => out.push(8),
                        b'f' => out.push(12),
                        b'\r' => {
                            if self.d.get(self.pos) == Some(&b'\n') {
                                self.pos += 1;
                            }
                        }
                        b'\n' => {}
                        b'0'..=b'7' => {
                            let mut v = (e - b'0') as u32;
                            for _ in 0..2 {
                                match self.d.get(self.pos) {
                                    Some(&o @ b'0'..=b'7') => {
                                        v = v * 8 + (o - b'0') as u32;
                                        self.pos += 1;
                                    }
                                    _ => break,
                                }
                            }
                            out.push(v as u8);
                        }
                        other => out.push(other),
                    }
                }
                _ => out.push(c),
            }
        }
        out
    }

    /// Next complete value (arrays/dicts nested); `N G R` becomes `Ref(N)`.
    fn value(&mut self) -> Option<Val> {
        let t = self.next()?;
        self.value_from(t)
    }

    fn value_from(&mut self, t: Tok) -> Option<Val> {
        match t {
            Tok::Val(Val::Num(n)) => {
                // Look ahead for an indirect reference `n g R`.
                let save = self.pos;
                if let Some(Tok::Val(Val::Num(_))) = self.next() {
                    if let Some(Tok::Val(Val::Kw(k))) = self.next() {
                        if k == "R" {
                            return Some(Val::Ref(n as u32));
                        }
                    }
                }
                self.pos = save;
                Some(Val::Num(n))
            }
            Tok::Val(v) => Some(v),
            Tok::ArrOpen => {
                let mut a = Vec::new();
                loop {
                    match self.next()? {
                        Tok::ArrClose => return Some(Val::Arr(a)),
                        t => a.push(self.value_from(t)?),
                    }
                }
            }
            Tok::DictOpen => {
                let mut d = Vec::new();
                loop {
                    match self.next()? {
                        Tok::DictClose => return Some(Val::Dict(d)),
                        Tok::Val(Val::Name(k)) => {
                            let v = self.value()?;
                            d.push((k, v));
                        }
                        _ => {}
                    }
                }
            }
            Tok::ArrClose | Tok::DictClose => Some(Val::Kw("?".into())),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Obj {
    pub dict: Val,
    pub stream: Option<Vec<u8>>,
}

pub struct PdfDoc {
    pub objs: HashMap<u32, Obj>,
}

fn find(hay: &[u8], needle: &[u8], from: usize) -> Option<usize> {
    hay.get(from..)?.windows(needle.len()).position(|w| w == needle).map(|p| p + from)
}

/// Undoes `/Filter /FlateDecode` (other filters are returned unchanged; predictors unsupported).
fn decode_stream(dict: &Val, raw: Vec<u8>) -> Vec<u8> {
    let flate = match dict.get("Filter") {
        Some(Val::Name(n)) => n == "FlateDecode",
        Some(Val::Arr(a)) => a.len() == 1 && a[0].name() == Some("FlateDecode"),
        _ => false,
    };
    if flate {
        zlib_decompress(&raw).unwrap_or(raw)
    } else {
        raw
    }
}

impl PdfDoc {
    pub fn parse(bytes: &[u8]) -> Result<Self, String> {
        if !bytes.starts_with(b"%PDF-") {
            return Err("not a PDF".into());
        }
        let mut objs = HashMap::new();
        let mut i = 0;
        while let Some(p) = find(bytes, b"obj", i) {
            i = p + 3;
            let before_ok = p > 0 && is_ws(bytes[p - 1]);
            let after_ok = bytes.get(p + 3).is_none_or(|&c| is_ws(c) || is_delim(c));
            if !before_ok || !after_ok {
                continue;
            }
            // Backtrack over "<num> <gen> ".
            let mut j = p;
            while j > 0 && is_ws(bytes[j - 1]) {
                j -= 1;
            }
            let gen_end = j;
            while j > 0 && bytes[j - 1].is_ascii_digit() {
                j -= 1;
            }
            if j == gen_end {
                continue;
            }
            while j > 0 && is_ws(bytes[j - 1]) {
                j -= 1;
            }
            let num_end = j;
            while j > 0 && bytes[j - 1].is_ascii_digit() {
                j -= 1;
            }
            if j == num_end {
                continue;
            }
            let Ok(num) = std::str::from_utf8(&bytes[j..num_end]).unwrap_or("x").parse::<u32>() else { continue };
            let mut lx = Lexer::new(bytes, p + 3);
            let Some(dict) = lx.value() else { break };
            let after = lx.pos;
            let mut stream = None;
            if let Some(Tok::Val(Val::Kw(k))) = lx.next() {
                if k == "stream" {
                    let mut s = lx.pos;
                    if bytes.get(s) == Some(&b'\r') {
                        s += 1;
                    }
                    if bytes.get(s) == Some(&b'\n') {
                        s += 1;
                    }
                    let by_len = match dict.get("Length") {
                        Some(Val::Num(n)) if *n >= 0.0 => {
                            let e = s + *n as usize;
                            let mut k2 = e;
                            while k2 < bytes.len() && is_ws(bytes[k2]) {
                                k2 += 1;
                            }
                            bytes.get(k2..).filter(|r| r.starts_with(b"endstream")).map(|_| e)
                        }
                        _ => None,
                    };
                    let end = match by_len.or_else(|| find(bytes, b"endstream", s)) {
                        Some(e) => e,
                        None => break,
                    };
                    let mut e = end;
                    if by_len.is_none() {
                        if e > s && bytes[e - 1] == b'\n' {
                            e -= 1;
                        }
                        if e > s && bytes[e - 1] == b'\r' {
                            e -= 1;
                        }
                    }
                    stream = Some(decode_stream(&dict, bytes[s..e].to_vec()));
                    i = end + 9;
                } else {
                    i = after;
                }
            }
            objs.insert(num, Obj { dict, stream });
        }
        let mut doc = PdfDoc { objs };
        doc.expand_object_streams();
        Ok(doc)
    }

    /// Objects stored inside `/Type /ObjStm` streams (PDF 1.5 compressed objects).
    fn expand_object_streams(&mut self) {
        let mut extra = Vec::new();
        for o in self.objs.values() {
            if o.dict.get("Type").and_then(Val::name) != Some("ObjStm") {
                continue;
            }
            let (Some(data), Some(Val::Num(n)), Some(Val::Num(first))) = (&o.stream, o.dict.get("N"), o.dict.get("First")) else { continue };
            let mut lx = Lexer::new(data, 0);
            let mut hdr = Vec::new();
            for _ in 0..(*n as usize) {
                if let (Some(Tok::Val(Val::Num(num))), Some(Tok::Val(Val::Num(off)))) = (lx.next(), lx.next()) {
                    hdr.push((num as u32, off as usize));
                }
            }
            for (num, off) in hdr {
                let mut vl = Lexer::new(data, *first as usize + off);
                if let Some(v) = vl.value() {
                    extra.push((num, Obj { dict: v, stream: None }));
                }
            }
        }
        for (num, o) in extra {
            self.objs.entry(num).or_insert(o);
        }
    }

    fn resolve<'a>(&'a self, v: &'a Val) -> &'a Val {
        match v {
            Val::Ref(n) => self.objs.get(n).map(|o| &o.dict).unwrap_or(v),
            _ => v,
        }
    }

    /// Page object numbers in document order (walks the page tree from its root).
    pub fn pages(&self) -> Vec<u32> {
        let root = self.objs.iter().filter(|(_, o)| o.dict.get("Type").and_then(Val::name) == Some("Pages") && o.dict.get("Parent").is_none()).map(|(n, _)| *n).min();
        let mut out = Vec::new();
        if let Some(r) = root {
            self.walk(r, &mut out, 0);
        }
        out
    }

    fn walk(&self, n: u32, out: &mut Vec<u32>, depth: u32) {
        let Some(o) = self.objs.get(&n) else { return };
        if depth > 32 {
            return;
        }
        match o.dict.get("Type").and_then(Val::name) {
            Some("Page") => out.push(n),
            Some("Pages") => {
                if let Some(Val::Arr(kids)) = o.dict.get("Kids").map(|k| self.resolve(k)) {
                    for k in kids {
                        if let Val::Ref(c) = k {
                            self.walk(*c, out, depth + 1);
                        }
                    }
                }
            }
            _ => {}
        }
    }

    fn resources(&self, n: u32) -> Option<&Val> {
        let mut cur = n;
        for _ in 0..32 {
            let o = self.objs.get(&cur)?;
            if let Some(r) = o.dict.get("Resources") {
                return Some(self.resolve(r));
            }
            match o.dict.get("Parent") {
                Some(Val::Ref(p)) => cur = *p,
                _ => return None,
            }
        }
        None
    }

    fn font(&self, resources: &Val, name: &str) -> Font {
        let fdict = resources.get("Font").map(|f| self.resolve(f)).and_then(|f| f.get(name)).map(|f| self.resolve(f));
        let Some(fd) = fdict else { return Font::default() };
        let two_byte = fd.get("Subtype").and_then(Val::name) == Some("Type0");
        let mut font = Font { width: if two_byte { 2 } else { 1 }, map: HashMap::new() };
        if let Some(Val::Ref(tu)) = fd.get("ToUnicode") {
            if let Some(data) = self.objs.get(tu).and_then(|o| o.stream.as_ref()) {
                parse_cmap(data, &mut font);
            }
        }
        font
    }

    /// Text of one page: every shown string decoded through its font's ToUnicode map.
    pub fn page_text(&self, page: u32) -> String {
        let mut out = String::new();
        let Some(o) = self.objs.get(&page) else { return out };
        let res = self.resources(page).cloned().unwrap_or(Val::Dict(Vec::new()));
        let contents: Vec<u32> = match o.dict.get("Contents") {
            Some(Val::Ref(c)) => match self.objs.get(c).map(|x| &x.dict) {
                Some(Val::Arr(a)) => a.iter().filter_map(|v| if let Val::Ref(r) = v { Some(*r) } else { None }).collect(),
                _ => vec![*c],
            },
            Some(Val::Arr(a)) => a.iter().filter_map(|v| if let Val::Ref(r) = v { Some(*r) } else { None }).collect(),
            _ => vec![],
        };
        let mut data = Vec::new();
        for c in contents {
            if let Some(s) = self.objs.get(&c).and_then(|x| x.stream.as_ref()) {
                data.extend_from_slice(s);
                data.push(b'\n');
            }
        }
        self.run_content(&data, &res, &mut out, 0);
        out
    }

    pub fn page_texts(&self) -> Vec<String> {
        self.pages().into_iter().map(|p| self.page_text(p)).collect()
    }

    fn run_content(&self, data: &[u8], res: &Val, out: &mut String, depth: u32) {
        if depth > 8 {
            return;
        }
        let mut lx = Lexer::new(data, 0);
        let mut ops: Vec<Val> = Vec::new();
        let mut fonts: HashMap<String, Font> = HashMap::new();
        let mut cur: Option<String> = None;
        // Marked-content stack; `true` where `/ActualText` replaces the glyphs inside (Skia uses it
        // for characters its subset fonts cannot map, e.g. "-" and the em dash).
        let mut marked: Vec<bool> = Vec::new();
        while let Some(t) = lx.next() {
            let v = match t {
                Tok::Val(Val::Num(n)) => Val::Num(n), // no `R` in content streams
                other => match lx.value_from(other) {
                    Some(v) => v,
                    None => break,
                },
            };
            let Val::Kw(op) = v else {
                ops.push(v);
                continue;
            };
            let replaced = marked.iter().any(|&m| m);
            match op.as_str() {
                "BMC" => marked.push(false),
                "BDC" => {
                    let actual = match ops.last() {
                        Some(d @ Val::Dict(_)) => d.get("ActualText").cloned(),
                        _ => None,
                    };
                    if let Some(Val::Str(s)) = actual {
                        if !replaced {
                            out.push_str(&text_string(&s));
                        }
                        marked.push(true);
                    } else {
                        marked.push(false);
                    }
                }
                "EMC" => {
                    marked.pop();
                }
                "Tj" | "'" | "\"" | "TJ" if replaced => {}
                "Tf" => {
                    if let Some(Val::Name(n)) = ops.iter().rev().nth(1) {
                        if !fonts.contains_key(n) {
                            fonts.insert(n.clone(), self.font(res, n));
                        }
                        cur = Some(n.clone());
                    }
                }
                "Tj" | "'" | "\"" => {
                    if let (Some(Val::Str(s)), Some(f)) = (ops.last(), cur.as_ref().and_then(|c| fonts.get(c))) {
                        out.push_str(&f.decode(s));
                    }
                }
                "TJ" => {
                    if let (Some(Val::Arr(a)), Some(f)) = (ops.last(), cur.as_ref().and_then(|c| fonts.get(c))) {
                        for item in a {
                            match item {
                                Val::Str(s) => out.push_str(&f.decode(s)),
                                Val::Num(n) if *n < -250.0 => out.push(' '),
                                _ => {}
                            }
                        }
                    }
                }
                "Td" | "TD" | "T*" | "Tm" | "ET" => out.push(' '),
                "Do" => {
                    if let Some(Val::Name(n)) = ops.last() {
                        let xo = res.get("XObject").map(|x| self.resolve(x)).and_then(|x| x.get(n)).cloned();
                        if let Some(Val::Ref(r)) = xo {
                            if let Some(x) = self.objs.get(&r) {
                                if x.dict.get("Subtype").and_then(Val::name) == Some("Form") {
                                    let sub = x.dict.get("Resources").map(|r| self.resolve(r).clone()).unwrap_or_else(|| res.clone());
                                    if let Some(s) = &x.stream {
                                        self.run_content(s, &sub, out, depth + 1);
                                    }
                                }
                            }
                        }
                    }
                }
                "BI" => {
                    // Inline image: skip binary data up to "EI".
                    if let Some(e) = find(data, b"EI", lx.pos) {
                        lx.pos = e + 2;
                    }
                }
                _ => {}
            }
            ops.clear();
        }
    }
}

#[derive(Default)]
struct Font {
    width: usize,
    map: HashMap<u32, String>,
}

impl Font {
    fn decode(&self, s: &[u8]) -> String {
        if self.map.is_empty() {
            return s.iter().map(|&b| b as char).collect();
        }
        let w = self.width.max(1);
        s.chunks(w).map(|c| {
            let code = c.iter().fold(0u32, |a, &b| a << 8 | b as u32);
            self.map.get(&code).cloned().unwrap_or_else(|| '\u{fffd}'.to_string())
        }).collect()
    }
}

fn utf16be(b: &[u8]) -> String {
    let units: Vec<u16> = b.chunks(2).map(|c| (c[0] as u16) << 8 | *c.get(1).unwrap_or(&0) as u16).collect();
    String::from_utf16_lossy(&units)
}

/// PDF text string: UTF-16BE with BOM, else PDFDocEncoding (treated as Latin-1).
fn text_string(b: &[u8]) -> String {
    match b {
        [0xfe, 0xff, rest @ ..] => utf16be(rest),
        _ => b.iter().map(|&c| c as char).collect(),
    }
}

fn code_of(b: &[u8]) -> u32 {
    b.iter().fold(0u32, |a, &x| a << 8 | x as u32)
}

fn parse_cmap(data: &[u8], font: &mut Font) {
    let mut lx = Lexer::new(data, 0);
    let mut toks = Vec::new();
    while let Some(t) = lx.next() {
        let v = match t {
            Tok::Val(Val::Num(n)) => Val::Num(n),
            other => match lx.value_from(other) {
                Some(v) => v,
                None => break,
            },
        };
        toks.push(v);
    }
    let mut i = 0;
    let kw = |v: &Val, k: &str| matches!(v, Val::Kw(x) if x == k);
    while i < toks.len() {
        if kw(&toks[i], "begincodespacerange") {
            if let Some(Val::Str(lo)) = toks.get(i + 1) {
                font.width = lo.len().max(1);
            }
        } else if kw(&toks[i], "beginbfchar") {
            i += 1;
            while i + 1 < toks.len() && !kw(&toks[i], "endbfchar") {
                if let (Val::Str(src), Val::Str(dst)) = (&toks[i], &toks[i + 1]) {
                    font.map.insert(code_of(src), utf16be(dst));
                }
                i += 2;
            }
        } else if kw(&toks[i], "beginbfrange") {
            i += 1;
            while i + 2 < toks.len() && !kw(&toks[i], "endbfrange") {
                if let (Val::Str(lo), Val::Str(hi)) = (&toks[i], &toks[i + 1]) {
                    let (lo, hi) = (code_of(lo), code_of(hi));
                    match &toks[i + 2] {
                        Val::Str(dst) if hi >= lo && hi - lo <= 0xffff => {
                            let mut units: Vec<u16> = dst.chunks(2).map(|c| (c[0] as u16) << 8 | *c.get(1).unwrap_or(&0) as u16).collect();
                            for code in lo..=hi {
                                font.map.insert(code, String::from_utf16_lossy(&units));
                                if let Some(last) = units.last_mut() {
                                    *last = last.wrapping_add(1);
                                }
                            }
                        }
                        Val::Arr(a) => {
                            for (k, d) in a.iter().enumerate() {
                                if let Val::Str(d) = d {
                                    font.map.insert(lo + k as u32, utf16be(d));
                                }
                            }
                        }
                        _ => {}
                    }
                }
                i += 3;
            }
        }
        i += 1;
    }
}

/// Whitespace-free text, so "Page 2 of 4" matches however the PDF positions its glyph runs.
pub fn squash(s: &str) -> String {
    s.chars().filter(|c| !c.is_whitespace()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    // Python: zlib.compress(fixture_text(), 9) — a dynamic-Huffman block with back references.
    fn zlib_fixture() -> Vec<u8> {
        hex("78da6dd14d0a02310c05e0bda7c8c695a84dd29fa9880b414fd023382e4450c691b9be15a69914ba0825f4a394f7ce09f6578408e90e47630ce6a13c9cc79e203de092566b185e1398034cff6397afe0fefc8e633fccdbe7ddf737d8725e668c82912b1c0aa6059360f21aa32d1817cc82396a4c38e38d59b015eca8c25dc1ea6527d83b8dd915acfeec05874e634b05ab3482e088158e8de8ba82d1588d9d6f44170563d0d873233a940a91ab0a83696487d221daaac310aaf07e08fa9b36")
    }

    fn fixture_text() -> Vec<u8> {
        let mut s = String::from("BT /F1 9 Tf <0001000200030004> Tj ET\n");
        for i in 0..12 {
            s.push_str(&format!("% row {i}: wow {:.3} flutter {:.3} speed {:+.2}\n", i as f64 * 0.013, i as f64 * 0.007, ((i % 7) - 3) as f64));
        }
        s.into_bytes()
    }

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }

    #[test]
    fn inflate_stored_and_fixed_blocks() {
        // Stored block: BFINAL=1, BTYPE=00, LEN=5, NLEN=!5, "hello".
        let stored = [0x01, 0x05, 0x00, 0xfa, 0xff, b'h', b'e', b'l', b'l', b'o'];
        assert_eq!(inflate(&stored).unwrap(), b"hello");
        // Fixed Huffman "a" (zlib.compress(b"a")[2:-4]).
        assert_eq!(inflate(&hex("4b0400")).unwrap(), b"a");
        assert!(inflate(&[0x07]).is_err(), "reserved block type");
        assert!(zlib_decompress(b"\x00\x00").is_err());
    }

    #[test]
    fn inflate_dynamic_block_with_back_references() {
        assert_eq!(zlib_fixture()[2] >> 1 & 3, 2, "fixture uses a dynamic block");
        assert_eq!(zlib_decompress(&zlib_fixture()).unwrap(), fixture_text());
    }

    fn mini_pdf() -> Vec<u8> {
        let cmap = b"/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n1 begincodespacerange <0000> <ffff> endcodespacerange\n\
            2 beginbfchar\n<0001> <0050>\n<0002> <0061>\nendbfchar\n1 beginbfrange\n<0003> <0004> <0067>\nendbfrange\nendcmap end end\n";
        let content = zlib_fixture();
        let page2 = b"BT /F2 8 Tf (Page 2 of 2 ) Tj /Span <</ActualText <FEFF2014>>> BDC (X) Tj EMC ET";
        let mut pdf = Vec::new();
        pdf.extend_from_slice(b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
        pdf.extend_from_slice(b"2 0 obj\n<< /Type /Pages /Kids [3 0 R 8 0 R] /Count 2 >>\nendobj\n");
        pdf.extend_from_slice(b"3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n");
        pdf.extend_from_slice(format!("4 0 obj\n<< /Length {} /Filter /FlateDecode >>\nstream\n", content.len()).as_bytes());
        pdf.extend_from_slice(&content);
        pdf.extend_from_slice(b"\nendstream\nendobj\n");
        pdf.extend_from_slice(b"5 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /ToUnicode 6 0 R >>\nendobj\n");
        pdf.extend_from_slice(format!("6 0 obj\n<< /Length {} >>\nstream\n", cmap.len()).as_bytes());
        pdf.extend_from_slice(cmap);
        pdf.extend_from_slice(b"\nendstream\nendobj\n");
        pdf.extend_from_slice(b"7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
        pdf.extend_from_slice(b"8 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F2 7 0 R >> >> /Contents [9 0 R] >>\nendobj\n");
        // Indirect /Length (resolved by scanning for endstream).
        pdf.extend_from_slice(b"9 0 obj\n<< /Length 10 0 R >>\nstream\n");
        pdf.extend_from_slice(page2);
        pdf.extend_from_slice(b"\nendstream\nendobj\n10 0 obj\n80\nendobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
        pdf
    }

    #[test]
    fn extracts_text_per_page_in_tree_order() {
        let doc = PdfDoc::parse(&mini_pdf()).unwrap();
        assert_eq!(doc.pages(), vec![3, 8]);
        let texts = doc.page_texts();
        assert_eq!(squash(&texts[0]), "Pagh");
        assert_eq!(squash(&texts[1]), "Page2of2\u{2014}", "ActualText replaces the marked glyphs");
        assert!(squash(&texts[1]).contains("Page2of"));
    }

    #[test]
    fn literal_string_escapes() {
        let mut lx = Lexer::new(br"(a\(b\)c\\d\101\nx (nested))", 0);
        assert_eq!(lx.next(), Some(Tok::Val(Val::Str(b"a(b)c\\dA\nx (nested)".to_vec()))));
        let mut lx = Lexer::new(b"<< /A [1 0 R 2] /B#20C /N >>", 0);
        let v = lx.value().unwrap();
        assert_eq!(v.get("A"), Some(&Val::Arr(vec![Val::Ref(1), Val::Num(2.0)])));
        assert_eq!(v.get("B C"), Some(&Val::Name("N".into())));
    }

    /// Dev aid: `DECKCHEK_PDF_TEXT=/path/file.pdf cargo test --lib pdf_text -- --ignored --nocapture`
    /// prints each page's text (used to check the extractor against Chromium "Save as PDF" output).
    #[test]
    #[ignore = "reads a PDF named by DECKCHEK_PDF_TEXT"]
    fn dump_pdf_text_from_env() {
        let Some(p) = std::env::var_os("DECKCHEK_PDF_TEXT") else { return };
        let bytes = std::fs::read(p).unwrap();
        let doc = PdfDoc::parse(&bytes).unwrap();
        for (i, t) in doc.page_texts().iter().enumerate() {
            println!("--- page {} ---\n{}", i + 1, t);
        }
    }
}
