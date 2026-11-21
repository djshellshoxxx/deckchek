"""Read retained JSON/TAP only; no project import, analyzer call or rerun."""
from collections import Counter, defaultdict
from pathlib import Path
import hashlib, json, math, re, struct

BASE = Path(__file__).resolve().parent
TRACE = BASE / 'trace'
PRIOR = Path('/workspace/scratch/6f2247f2f463/deckchek-fit-functional/docs/engineering/evidence/audio-context-functional-2026-11-20/two-file-aggregate/contexts.json')
STAGES = ['before-fundamental', 'fundamental-return', 'cached-tone-rms-initial-thdn', 'after-harmonics', 'after-low-high', 'after-channel-metrics']
READOUTS = ['after-both-channels', 'response-reference', 'after-response-and-crosstalk', 'after-hum-read', 'return']
sha = lambda raw: hashlib.sha256(raw).hexdigest()

def save(name, value):
    (TRACE / name).write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')

def value(v):
    if isinstance(v, dict) and 'decimal' in v:
        n = float(v['decimal'])
        return n if math.isfinite(n) else {'nonFiniteNumber': v['decimal']}
    return v

def metrics(items, encoded=False):
    return {item['metricId']: value(item['value']) if encoded else item['value'] for item in items}

def array_view(v):
    return {'type': v['type'], 'length': v.get('length', v.get('samples')), 'bytes': v.get('byteLength', v.get('bytes')), 'sha256': v['sha256']}

numeric_count = 0
numeric_errors = []
nonfinite = Counter()
def check_numbers(v, location):
    global numeric_count
    if isinstance(v, dict):
        if set(v) == {'decimal', 'ieee754be'}:
            numeric_count += 1
            number = float(v['decimal'])
            binary = struct.unpack('>d', bytes.fromhex(v['ieee754be']))[0]
            if math.isnan(number):
                nonfinite['NaN'] += 1
                if not math.isnan(binary): numeric_errors.append(location)
            elif struct.pack('>d', number).hex() != v['ieee754be']: numeric_errors.append(location)
            elif not math.isfinite(number): nonfinite[v['decimal']] += 1
        else:
            for key, child in v.items(): check_numbers(child, location + '/' + key)
    elif isinstance(v, list):
        for i, child in enumerate(v): check_numbers(child, location + '/' + str(i))

summaries, all_groups, all_headers = [], {}, {}
for path in sorted((TRACE / 'traces').glob('*.json')):
    raw = path.read_bytes(); data = json.loads(raw); groups = defaultdict(list)
    check_numbers(data['records'], path.name)
    for record in data['records']: groups[record['analysis']].append(record)
    name = Path(data['testFile']).name
    all_groups[name], all_headers[name] = groups, {k:v for k,v in data.items() if k != 'records'}
    analyses, fit_ids = [], []
    for analysis, records in groups.items():
        entry = records[0]; final = next((r for r in records if r['phase'] == 'return'), None)
        item = {'analysis': analysis, 'record_count': len(records), 'entry': entry, 'completed': final is not None}
        if final:
            expected = [('validated-entry', None)] + [(phase, c) for c in ('L','R') for phase in STAGES] + [(phase, None) for phase in READOUTS]
            item.update({'phase_order_exact': [(r['phase'], r.get('channel')) for r in records] == expected,
                         'entry_return_full_input_equal': entry['input'] == final['input'], 'channels': {}})
            for channel in ('L','R'):
                stages = [r for r in records if r.get('channel') == channel]
                fundamental = next(r['fit'] for r in stages if r['phase'] == 'fundamental-return')
                fits = [{'phase':r['phase'],'fit':r['fit']} for r in stages if r['fit'] is not None]
                fits += [{'phase':r['phase'],'fit':r['channels'][channel]['fit']} for r in records if 'channels' in r]
                inputs = [r['input'] for r in stages]; fit_ids.append(fundamental['objectId'])
                item['channels'][channel] = {'fundamental':fundamental, 'fit_snapshot_count':len(fits),
                    'fit_identity_and_fields_equal':all(r['fit'] == fundamental for r in fits),
                    'fit_changes':[r for r in fits if r['fit'] != fundamental], 'slice_snapshot_count':len(inputs),
                    'slice_identity_and_hash_equal':all(p == inputs[0] for p in inputs),
                    'slice_backing_buffer_matches_entry':inputs[0]['bufferId'] == entry['input']['left' if channel == 'L' else 'right']['bufferId'], 'slice':inputs[0]}
            item.update({'final_values':final['values'], 'measurements':final['measurements']})
        analyses.append(item)
    completed = [a for a in analyses if a['completed']]
    channels = [c for a in completed for c in a['channels'].values()]
    summaries.append({'file':path.name,'bytes':len(raw),'sha256':sha(raw),'pid':data['pid'],'parent_child_execArgv':data['execArgv'],
        'record_count':len(data['records']),'contiguous_sequences':[r['sequence'] for r in data['records']] == list(range(1,len(data['records'])+1)),
        'validated_entries':len(groups),'completed_analyses':len(completed),'entry_only_analyses':[a['analysis'] for a in analyses if not a['completed']],
        'all_phase_orders_exact':all(a['phase_order_exact'] for a in completed),
        'all_entry_return_full_inputs_equal':all(a['entry_return_full_input_equal'] for a in completed),
        'fundamental_fit_count':len(channels),'fundamental_ids_unique':len(set(fit_ids)) == len(fit_ids),
        'fit_snapshot_count':sum(c['fit_snapshot_count'] for c in channels),'all_fit_identities_fields_equal':all(c['fit_identity_and_fields_equal'] for c in channels),
        'slice_snapshot_count':sum(c['slice_snapshot_count'] for c in channels),'all_slice_identities_hashes_equal':all(c['slice_identity_and_hash_equal'] for c in channels),
        'all_slice_buffers_match_entry':all(c['slice_backing_buffer_matches_entry'] for c in channels),
        'truncated':data['truncated'],'dropped':data['dropped'],'errors':data['errors'],'analyses':analyses})

contexts_raw=(TRACE/'contexts.json').read_bytes(); contexts=json.loads(contexts_raw)['results']
runner=all_groups['audio-runner-lifecycle.test.mjs']
returns=[(i,next(r for r in rs if r['phase']=='return')) for i,rs in runner.items() if any(r['phase']=='return' for r in rs)]
comparison=[]
for (analysis, final), context in zip(returns,contexts):
    item={'analysis':analysis,'finish_sequence':context['sequence'],'source':context['source'],'status':context['result']['status'],
          'measurement_ids_values_equal':metrics(final['measurements'],True)==metrics(context['result']['measurements'])}
    if context['source']=='live':
        item['entry_return_and_finish_input_equal']=all(array_view(runner[analysis][0]['input'][c])==array_view(final['input'][c])==array_view(context['input'][c]) for c in ('left','right'))
    else:
        item.update({'finish_input_unobserved':context['input'] is None,'analyzer_entry_input':runner[analysis][0]['input']})
    comparison.append(item)

prior_raw=PRIOR.read_bytes(); prior=json.loads(prior_raw)['results'][2]; retry=contexts[2]
before=metrics(prior['result']['measurements']); after=metrics(retry['result']['measurements'])
prior_comparison={'prior_path':str(PRIOR),'prior_sha256':sha(prior_raw),'current_sha256':sha(contexts_raw),
    'prior_status':prior['result']['status'],'current_status':retry['result']['status'],
    'finish_input_equal':prior['input']==retry['input'],'calls_equal':prior['callsAtFinish']==retry['callsAtFinish'],
    'playback_equal':prior['playback']==retry['playback'],
    'metric_differences':{k:{'prior':before.get(k),'current':after.get(k)} for k in sorted(before.keys()|after.keys()) if before.get(k)!=after.get(k)},
    'limits':['Prior input hashes were taken after that suite, not at analyzer entry.','New entry hashes cannot establish prior entry identity retroactively.','Changed instrumentation/context means this pass does not supersede old failures or identify a cause.']}
save('prior-context-comparison.json',prior_comparison)
for label,name in [('retry','audio-runner-lifecycle.test.mjs'),('cubic','audio-quality.test.mjs')]:
    payload={'test_file':name,'pid':all_headers[name]['pid'],'analysis':3,'records':all_groups[name][3]}
    if label=='retry': payload['finish_record']=retry
    payload['mapping']='Third validated analysis in the original sequential test file; source order and retained output identify the '+label+' case. Mapping is not a new test invocation.'
    save(label+'-snapshots.json',payload)
tap=(TRACE/'run.tap').read_text()
save('actual-execution-order.json',{'subtests':re.findall(r'^# Subtest: (.+)$',tap,re.M),'outcomes':re.findall(r'^(?:not )?ok \d+ - .+$',tap,re.M)})
summary={'schema':'deckchek.audio-fit-derived-observations.v1','method':'Read-only retained JSON/TAP; no project import, audio calculation or rerun.',
    'processor_sha256':sha(Path(__file__).read_bytes()),'numeric_snapshots_checked':numeric_count,'numeric_consistency_errors':numeric_errors,
    'nonfinite_snapshots':dict(nonfinite),'traces':summaries,
    'aggregate':{'bytes':len(contexts_raw),'sha256':sha(contexts_raw),'records':len(contexts),'sources':dict(Counter(c['source'] for c in contexts)),
        'statuses':dict(Counter(c['result']['status'] for c in contexts)),'return_count_matches':len(returns)==len(contexts),'comparisons':comparison,
        'limits':'Metric IDs/values compared in observed order; aggregate JSON discards signed zero. Identical values alone do not uniquely identify asynchronous calls. Imported inputs remain unobserved in the aggregate.'}}
save('observed-summary.json',summary)
assert not numeric_errors
for s in summaries:
    assert all(s[k] for k in ['contiguous_sequences','all_phase_orders_exact','all_entry_return_full_inputs_equal','fundamental_ids_unique','all_fit_identities_fields_equal','all_slice_identities_hashes_equal','all_slice_buffers_match_entry'])
    assert not s['truncated'] and not s['dropped'] and not s['errors']
print(json.dumps({'numeric_snapshots':numeric_count,'numeric_errors':numeric_errors,
    'traces':[{k:v for k,v in s.items() if k not in ('analyses','parent_child_execArgv')} for s in summaries],
    'aggregate':summary['aggregate'],'prior_retry_differences':prior_comparison['metric_differences']},indent=2))
