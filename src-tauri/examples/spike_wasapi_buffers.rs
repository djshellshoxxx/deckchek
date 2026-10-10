//! THROWAWAY spike (M6-latency-spike, FS-11 section 7). Not part of the app, not in CI.
//!
//! Question: does cpal 0.16 (WASAPI, shared mode) honour `BufferSize::Fixed(n)`, and what
//! period does the driver actually use? For each requested size it opens an input and an
//! output stream on the chosen devices, runs for a few seconds, and logs requested vs
//! actual callback frames, callback intervals and xruns. Prints a table, writes JSON.
//!
//! Build/run (see docs/testing/results/spike-wasapi-buffers.md):
//!   cargo run --release --example spike_wasapi_buffers -- --list
//!   cargo run --release --example spike_wasapi_buffers -- --input "Audio 8" --output "Audio 8" --json audio8.json

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{BufferSize, Device, SampleFormat, SampleRate, SizedSample, StreamConfig, SupportedBufferSize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Default)]
struct Probe {
    last: Option<Instant>,
    frames: Vec<u32>,
    gaps_us: Vec<u32>,
}

impl Probe {
    fn with_capacity(n: usize) -> Self {
        Probe { last: None, frames: Vec::with_capacity(n), gaps_us: Vec::with_capacity(n) }
    }
    fn tick(&mut self, frames: usize) {
        let now = Instant::now();
        if let Some(prev) = self.last {
            if self.gaps_us.len() < self.gaps_us.capacity() {
                self.gaps_us.push(now.duration_since(prev).as_micros().min(u32::MAX as u128) as u32);
            }
        }
        self.last = Some(now);
        if self.frames.len() < self.frames.capacity() {
            self.frames.push(frames as u32);
        }
    }
}

struct Args {
    input: Option<String>,
    output: Option<String>,
    sizes: Vec<u32>,
    seconds: u64,
    rate: Option<u32>,
    json: String,
    list: bool,
}

fn parse_args() -> Args {
    let mut a = Args {
        input: None,
        output: None,
        sizes: vec![1024, 512, 256, 192, 128, 96, 64, 48, 32],
        seconds: 8,
        rate: None,
        json: "spike-wasapi-buffers.json".into(),
        list: false,
    };
    let mut it = std::env::args().skip(1);
    while let Some(k) = it.next() {
        match k.as_str() {
            "--list" => a.list = true,
            "--input" => a.input = it.next(),
            "--output" => a.output = it.next(),
            "--sizes" => {
                if let Some(v) = it.next() {
                    a.sizes = v.split(',').filter_map(|s| s.trim().parse().ok()).collect();
                }
            }
            "--seconds" => a.seconds = it.next().and_then(|v| v.parse().ok()).unwrap_or(8),
            "--rate" => a.rate = it.next().and_then(|v| v.parse().ok()),
            "--json" => a.json = it.next().unwrap_or(a.json.clone()),
            other => {
                eprintln!("unknown argument {other}\nusage: --list | --input NAME --output NAME [--sizes 512,256,128] [--seconds 8] [--rate 48000] [--json file]");
                std::process::exit(2);
            }
        }
    }
    a
}

fn dev_name(d: &Device) -> String {
    d.name().unwrap_or_else(|_| "<unnamed>".into())
}

fn pick(devs: Vec<Device>, want: &Option<String>, default: Option<Device>) -> Option<Device> {
    match want {
        Some(w) => {
            let w = w.to_lowercase();
            devs.into_iter().find(|d| dev_name(d).to_lowercase().contains(&w))
        }
        None => default,
    }
}

fn describe_buf(b: &SupportedBufferSize) -> Value {
    match b {
        SupportedBufferSize::Range { min, max } => json!({ "min": min, "max": max }),
        SupportedBufferSize::Unknown => json!("unknown"),
    }
}

fn list(host: &cpal::Host) {
    println!("host: {:?}", host.id());
    for (label, is_in) in [("INPUT", true), ("OUTPUT", false)] {
        println!("\n{label} devices:");
        let devs: Vec<Device> = if is_in {
            host.input_devices().map(|i| i.collect()).unwrap_or_default()
        } else {
            host.output_devices().map(|i| i.collect()).unwrap_or_default()
        };
        for d in devs {
            println!("  {}", dev_name(&d));
            let cfgs: Vec<_> = if is_in {
                d.supported_input_configs().map(|i| i.collect()).unwrap_or_default()
            } else {
                d.supported_output_configs().map(|i| i.collect()).unwrap_or_default()
            };
            for c in cfgs {
                println!(
                    "     ch={} rate={}..{} fmt={:?} buffer={}",
                    c.channels(), c.min_sample_rate().0, c.max_sample_rate().0, c.sample_format(), describe_buf(c.buffer_size())
                );
            }
        }
    }
}

fn build_in<T: SizedSample + Send + 'static>(
    dev: &Device, cfg: &StreamConfig, probe: Arc<Mutex<Probe>>, errs: Arc<AtomicU64>, errlog: Arc<Mutex<Vec<String>>>,
) -> Result<cpal::Stream, cpal::BuildStreamError> {
    let ch = cfg.channels as usize;
    dev.build_input_stream(
        cfg,
        move |data: &[T], _| {
            if let Ok(mut p) = probe.lock() {
                p.tick(data.len() / ch.max(1));
            }
        },
        move |e| {
            errs.fetch_add(1, Ordering::Relaxed);
            if let Ok(mut l) = errlog.lock() {
                if l.len() < 20 {
                    l.push(format!("{e}"));
                }
            }
        },
        None,
    )
}

fn build_out<T: SizedSample + Send + 'static>(
    dev: &Device, cfg: &StreamConfig, probe: Arc<Mutex<Probe>>, errs: Arc<AtomicU64>, errlog: Arc<Mutex<Vec<String>>>,
) -> Result<cpal::Stream, cpal::BuildStreamError> {
    let ch = cfg.channels as usize;
    dev.build_output_stream(
        cfg,
        move |data: &mut [T], _| {
            for s in data.iter_mut() {
                *s = T::EQUILIBRIUM; // silence: this spike measures timing only
            }
            if let Ok(mut p) = probe.lock() {
                p.tick(data.len() / ch.max(1));
            }
        },
        move |e| {
            errs.fetch_add(1, Ordering::Relaxed);
            if let Ok(mut l) = errlog.lock() {
                if l.len() < 20 {
                    l.push(format!("{e}"));
                }
            }
        },
        None,
    )
}

fn pct(sorted: &[u32], p: f64) -> u32 {
    if sorted.is_empty() {
        return 0;
    }
    sorted[(((sorted.len() - 1) as f64) * p).round() as usize]
}

/// Summarise one direction. `requested` in frames, `rate` in Hz.
fn summarise(p: &Probe, requested: u32, rate: u32) -> Value {
    let mut f = p.frames.clone();
    f.sort_unstable();
    let mut g = p.gaps_us.clone();
    g.sort_unstable();
    let actual = pct(&f, 0.5);
    let period_us = actual as f64 * 1e6 / rate as f64;
    // Callbacks arrive in bursts on WASAPI shared mode; count gaps > 1.5x the actual period as xruns.
    let xruns = g.iter().filter(|&&x| (x as f64) > 1.5 * period_us).count();
    json!({
        "callbacks": p.frames.len(),
        "requestedFrames": requested,
        "actualFramesMedian": actual,
        "actualFramesMin": f.first().copied().unwrap_or(0),
        "actualFramesMax": f.last().copied().unwrap_or(0),
        "actualPeriodMs": period_us / 1000.0,
        "honoured": actual == requested,
        "gapMsMedian": pct(&g, 0.5) as f64 / 1000.0,
        "gapMsP99": pct(&g, 0.99) as f64 / 1000.0,
        "gapMsMax": g.last().copied().unwrap_or(0) as f64 / 1000.0,
        "gapXruns": xruns,
    })
}

fn run_one(inp: &Device, out: &Device, ic: &StreamConfig, oc: &StreamConfig, ifmt: SampleFormat, ofmt: SampleFormat, size: u32, secs: u64) -> Value {
    let rate = ic.sample_rate.0;
    let cap = (secs as usize + 2) * (rate as usize / size.max(16) as usize + 100) * 2;
    let ip = Arc::new(Mutex::new(Probe::with_capacity(cap)));
    let op = Arc::new(Mutex::new(Probe::with_capacity(cap)));
    let errs = Arc::new(AtomicU64::new(0));
    let errlog = Arc::new(Mutex::new(Vec::<String>::new()));
    let mut ic = ic.clone();
    let mut oc = oc.clone();
    ic.buffer_size = BufferSize::Fixed(size);
    oc.buffer_size = BufferSize::Fixed(size);

    let ins = match ifmt {
        SampleFormat::F32 => build_in::<f32>(inp, &ic, ip.clone(), errs.clone(), errlog.clone()),
        SampleFormat::I16 => build_in::<i16>(inp, &ic, ip.clone(), errs.clone(), errlog.clone()),
        SampleFormat::I32 => build_in::<i32>(inp, &ic, ip.clone(), errs.clone(), errlog.clone()),
        f => return json!({ "requested": size, "status": format!("unsupported input format {f:?}") }),
    };
    let outs = match ofmt {
        SampleFormat::F32 => build_out::<f32>(out, &oc, op.clone(), errs.clone(), errlog.clone()),
        SampleFormat::I16 => build_out::<i16>(out, &oc, op.clone(), errs.clone(), errlog.clone()),
        SampleFormat::I32 => build_out::<i32>(out, &oc, op.clone(), errs.clone(), errlog.clone()),
        f => return json!({ "requested": size, "status": format!("unsupported output format {f:?}") }),
    };
    let (ins, outs) = match (ins, outs) {
        (Ok(a), Ok(b)) => (a, b),
        (a, b) => {
            let msg = format!("build failed: in={:?} out={:?}", a.err().map(|e| e.to_string()), b.err().map(|e| e.to_string()));
            return json!({ "requested": size, "status": msg });
        }
    };
    let play = ins.play().and_then(|_| outs.play());
    if let Err(e) = play {
        return json!({ "requested": size, "status": format!("play failed: {e}") });
    }
    std::thread::sleep(Duration::from_secs(secs));
    drop(ins);
    drop(outs);
    let (i, o) = (ip.lock().unwrap(), op.lock().unwrap());
    json!({
        "requested": size,
        "status": "ok",
        "input": summarise(&i, size, rate),
        "output": summarise(&o, size, rate),
        "streamErrors": errs.load(Ordering::Relaxed),
        "streamErrorText": *errlog.lock().unwrap(),
    })
}

fn row(r: &Value) -> String {
    if r["status"] != "ok" {
        return format!("{:>6} | {}", r["requested"], r["status"].as_str().unwrap_or("?"));
    }
    let f = |d: &str, k: &str| r[d][k].clone();
    format!(
        "{:>6} | in {:>5} ({:>6.2} ms) out {:>5} ({:>6.2} ms) | gap p99 in {:>6.2} out {:>6.2} ms | max in {:>6.2} out {:>6.2} | xr in {:>3} out {:>3} err {:>3} | honoured in={} out={}",
        r["requested"], f("input", "actualFramesMedian"), r["input"]["actualPeriodMs"].as_f64().unwrap_or(0.0),
        f("output", "actualFramesMedian"), r["output"]["actualPeriodMs"].as_f64().unwrap_or(0.0),
        r["input"]["gapMsP99"].as_f64().unwrap_or(0.0), r["output"]["gapMsP99"].as_f64().unwrap_or(0.0),
        r["input"]["gapMsMax"].as_f64().unwrap_or(0.0), r["output"]["gapMsMax"].as_f64().unwrap_or(0.0),
        f("input", "gapXruns"), f("output", "gapXruns"), r["streamErrors"],
        f("input", "honoured"), f("output", "honoured"),
    )
}

fn main() {
    let a = parse_args();
    let host = cpal::default_host();
    if a.list {
        list(&host);
        return;
    }
    let inp = pick(host.input_devices().map(|i| i.collect()).unwrap_or_default(), &a.input, host.default_input_device());
    let out = pick(host.output_devices().map(|i| i.collect()).unwrap_or_default(), &a.output, host.default_output_device());
    let (Some(inp), Some(out)) = (inp, out) else {
        eprintln!("device not found; run with --list and pass a substring of the name");
        std::process::exit(1);
    };
    let (iname, oname) = (dev_name(&inp), dev_name(&out));
    let idef = inp.default_input_config().expect("default input config");
    let odef = out.default_output_config().expect("default output config");
    let rate = a.rate.unwrap_or(idef.sample_rate().0);
    let mut ic: StreamConfig = idef.config();
    let mut oc: StreamConfig = odef.config();
    ic.sample_rate = SampleRate(rate);
    oc.sample_rate = SampleRate(rate);
    println!("host {:?}\ninput  : {iname} ch={} fmt={:?} buffer={}\noutput : {oname} ch={} fmt={:?} buffer={}\nrate {rate} Hz, {} s per size\n",
        host.id(), ic.channels, idef.sample_format(), describe_buf(idef.buffer_size()),
        oc.channels, odef.sample_format(), describe_buf(odef.buffer_size()), a.seconds);

    let mut rows = Vec::new();
    for &size in &a.sizes {
        let r = run_one(&inp, &out, &ic, &oc, idef.sample_format(), odef.sample_format(), size, a.seconds);
        println!("{}", row(&r));
        rows.push(r);
    }
    let doc = json!({
        "tool": "spike_wasapi_buffers", "cpal": "0.16", "os": std::env::consts::OS,
        "host": format!("{:?}", host.id()), "input": iname, "output": oname, "sampleRate": rate,
        "secondsPerSize": a.seconds, "inputBufferSupport": describe_buf(idef.buffer_size()),
        "outputBufferSupport": describe_buf(odef.buffer_size()), "results": rows,
    });
    std::fs::write(&a.json, serde_json::to_string_pretty(&doc).unwrap()).expect("write json");
    println!("\nwrote {}", a.json);
}
