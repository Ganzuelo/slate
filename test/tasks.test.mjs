import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const context = vm.createContext({ Date, console });
vm.runInContext(await fs.readFile(new URL('../public/tasks.js', import.meta.url), 'utf8'), context);
const engine = context.SlateTasks;
const plain = value => JSON.parse(JSON.stringify(value));
const parse = content => plain(engine.parseTasks([{ path: 'Projects/Notes.md', content }]));
const run = (tasks, query) => plain(engine.query(tasks, query, '2026-10-28'));

test('in-progress markers remain incomplete and preserve metadata through state changes',()=>{
 for(const prefix of ['- [/]','-[/]','  - [/]','> - [/]','1. [/]']){
  const raw=prefix+' Working 📅 2026-11-14 ⏫ ^work <!-- keep -->';
  const task=parse(raw)[0];assert.equal(task.status,'/');assert.equal(task.completed,false);
  assert.equal(run([task],'not done').tasks.length,1);
  const open=engine.updateMetadata(task,{status:' '});assert.equal(open,raw.replace('[/]','[ ]'));
  assert.equal(engine.updateMetadata(parse(open)[0],{status:'/'}),raw);
  assert.equal(parse(engine.updateMetadata(task,{due:'2026-11-15'}))[0].status,'/');
  const done=parse(engine.complete(task,'2026-11-03').completedLine)[0];assert.equal(done.completed,true);assert.equal(done.status,'x');
 }
});

test('urgency presents three choices and maps legacy priorities without rewriting Markdown',()=>{
 assert.deepEqual(plain(engine.urgencies),[{value:'highest',label:'Urgent'},{value:'high',label:'High'},{value:'low',label:'Low'}]);
 for(const [priority,expected] of [['highest','highest'],['high','high'],['medium','high'],['normal','low'],['low','low'],['lowest','low']])assert.equal(engine.urgency(priority).value,expected);
 const raw='- [ ] Imported 🔼';const task=parse(raw)[0];
 assert.equal(task.priority,'medium');assert.equal(engine.urgency(task.priority).label,'High');assert.equal(task.raw,raw);
 assert.equal(run([task],'priority medium').tasks.length,1);
});

test('quick task metadata changes preserve literal code, comments, IDs and other fields',()=>{
 const raw='  - [/] Review `⏫ 📅 2026-01-01` #work ⏳ 2026-11-03 📅 2026-11-04 ⏫ ^review <!-- keep -->';
 const task=parse(raw)[0];
 const edited=engine.updateMetadata(task,{due:'2026-11-05',priority:'highest'});
 assert.equal(edited,'  - [/] Review `⏫ 📅 2026-01-01` #work ⏳ 2026-11-03 📅 2026-11-05 🔺 ^review <!-- keep -->');
 assert.equal(parse(edited)[0].priority,'highest');assert.equal(parse(edited)[0].due,'2026-11-05');
 const cleared=engine.updateMetadata(parse(edited)[0],{due:'',priority:'normal'});
 assert.ok(cleared.includes('`⏫ 📅 2026-01-01`'));assert.equal(parse(cleared)[0].due,null);assert.equal(parse(cleared)[0].priority,'normal');
 assert.throws(()=>engine.updateMetadata(task,{due:'2026-02-30'}),/valid date/);
 assert.throws(()=>engine.updateMetadata(task,{priority:'bad'}),/Invalid priority/);
});

test('empty tasks accept dates and urgency without a placeholder description',()=>{
 const task=parse('- [ ] ')[0];
 assert.equal(engine.updateMetadata(task,{due:'2026-11-05'}),'- [ ] 📅 2026-11-05');
 assert.equal(engine.updateMetadata(task,{priority:'high'}),'- [ ] ⏫');
});

test('Tasks parses checkboxes, dates, priority, tags, recurrence and exact source positions', () => {
  const source = '# Work\r\n  - [ ] Send report #work/client ⏫ 🛫 2026-10-26 ⏳ 2026-10-27 📅 2026-10-28 ➕ 2026-10-01 🔁 every week\r\n+ [X] Done ✅ 2026-10-25\r\n1. [/] Working 🔽\r\n> - [ ] Quoted task\r\n';
  const tasks = parse(source);
  assert.equal(tasks.length, 4);
  assert.equal(tasks[0].line, 2); assert.equal(tasks[0].raw, source.split('\r\n')[1]);
  assert.equal(tasks[0].text, 'Send report #work/client');
  assert.equal(tasks[0].priority, 'high'); assert.equal(tasks[0].recurrence, 'every week');
  assert.equal(tasks[0].due, '2026-10-28'); assert.equal(tasks[0].start, '2026-10-26'); assert.equal(tasks[0].scheduled, '2026-10-27'); assert.equal(tasks[0].created, '2026-10-01');
  assert.deepEqual(tasks[0].tags, ['#work/client']);
  assert.equal(tasks[1].completed, true); assert.equal(tasks[1].done, '2026-10-25');
  assert.equal(tasks[2].status, '/'); assert.equal(tasks[2].completed, false);
});
test('Tasks skips YAML, fenced examples, comments and inline-code metadata', () => {
  const source = '---\n- [ ] Not frontmatter task\n---\n```tasks\n- [ ] Not code task\n```\n~~~markdown\n- [ ] Not tilde task\n~~~\n<!--\n```\n- [ ] Not comment task\n-->\n- [ ] Real `📅 2026-01-01` #visible <!-- 📅 2026-02-01 #hidden -->\n';
  const tasks = parse(source);
  assert.equal(tasks.length, 1); assert.equal(tasks[0].line, 14); assert.equal(tasks[0].due, null); assert.deepEqual(tasks[0].tags, ['#visible']);
  assert.equal(parse('```html\n<!--\n```\n- [ ] Actual task').length, 1);
});
test('Tasks date filters use exclusive before/after and local reference dates', () => {
  const tasks = parse('- [ ] Yesterday 📅 2026-10-27\n- [ ] Today 📅 2026-10-28\n- [ ] Tomorrow 📅 2026-10-29\n- [ ] Undated\n- [x] Done today 📅 2026-10-28 ✅ 2026-10-28');
  assert.deepEqual(run(tasks, 'not done\ndue today').tasks.map(t => t.text), ['Today']);
  assert.deepEqual(run(tasks, 'not done\ndue before tomorrow').tasks.map(t => t.text), ['Yesterday','Today']);
  assert.deepEqual(run(tasks, 'due after today').tasks.map(t => t.text), ['Tomorrow']);
  assert.deepEqual(run(tasks, 'due on or before today\ndone').tasks.map(t => t.text), ['Done today']);
  assert.deepEqual(run(tasks, 'no due date').tasks.map(t => t.text), ['Undated']);
  assert.equal(run(tasks, 'due 2026-02-30').errors.length, 1);
});
test('Tasks combines string/tag/priority filters and multiple stable sorts with a limit', () => {
  const tasks = plain(engine.parseTasks([
    { path:'Work/B.md',content:'- [ ] Ship #work ⏫ 📅 2026-10-29\n- [ ] Review #work 🔺 📅 2026-10-28\n- [ ] Draft #personal 🔽' },
    { path:'Home/A.md',content:'- [ ] Ship #work ⏫ 📅 2026-10-28' },
  ]));
  const result = run(tasks, 'path includes Work/\ntags include #work\npriority is above medium\nsort by priority\nsort by due\nlimit to 1 tasks');
  assert.equal(result.errors.length, 0); assert.equal(result.tasks.length, 1); assert.equal(result.tasks[0].text, 'Review #work');
  assert.equal(run(tasks, 'description includes ship\npriority high').tasks.length, 2);
  assert.equal(run(tasks, 'tags does not include #work').tasks.length, 1);
  assert.equal(run(tasks, 'limit 0').tasks.length, 0);
});
test('Tasks returns explicit errors for unknown instructions without evaluating code or broadening results', () => {
  const tasks = parse('- [ ] Everything');
  const result = run(tasks, 'not done\nfilter by function globalThis.compromised = true');
  assert.equal(result.tasks.length, 0); assert.match(result.errors[0], /Line 2/); assert.equal(context.compromised, undefined);
  assert.equal(run(tasks, 'sort by urgency').tasks.length, 0);
});
test('Tasks grouping returns named groups and presentation directives separately', () => {
  const tasks = parse('- [ ] Open 📅 2026-10-28\n- [x] Closed 📅 2026-10-28\n- [ ] No date');
  const result = run(tasks, 'group by status\nhide due date\nhide edit button');
  assert.deepEqual(result.groups.map(g => g.name), ['Done','Todo']);
  assert.deepEqual(result.hidden, ['due date','edit button']);
  assert.equal(result.tasks.length, 3);
});
test('Tasks completion and uncompletion preserve indentation and checkbox bullets, add/remove done date', () => {
  const [task] = parse('  * [ ] Finish #work 📅 2026-11-01 ^task-block');
  const result = plain(engine.complete(task, '2026-10-28', true));
  assert.equal(result.completedLine, '  * [x] Finish #work 📅 2026-11-01 ✅ 2026-10-28 ^task-block');
  const [done] = parse(result.completedLine);
  assert.equal(engine.complete(done, '2026-10-29', false).completedLine, task.raw);
  assert.equal(engine.complete(done, '2026-10-29', true).completedLine, result.completedLine);
  assert.throws(() => engine.complete(task, '2026-02-30'), /valid date/);
  const [commented] = parse('- [ ] Visible <!-- ✅ 2025-01-01 -->');
  assert.equal(engine.complete(commented, '2026-10-28', true).completedLine, '- [x] Visible ✅ 2026-10-28 <!-- ✅ 2025-01-01 -->');
});
test('Tasks recurring completion advances reference dates and retains their relative distance', () => {
  const [task] = parse('- [ ] Review 🔁 every 2 weeks 🛫 2026-10-20 ⏳ 2026-10-25 📅 2026-10-28 ➕ 2026-10-01');
  const result = plain(engine.complete(task, '2026-10-28', true));
  assert.equal(result.completedLine, task.raw.replace('[ ]','[x]') + ' ✅ 2026-10-28');
  assert.equal(result.nextLine, '- [ ] Review 🔁 every 2 weeks 🛫 2026-11-03 ⏳ 2026-11-08 📅 2026-11-11 ➕ 2026-10-28');
  const edits = plain(engine.completionEdits(task,true,'2026-10-28'));
  assert.deepEqual(edits, [{line:1,oldLine:task.raw,newLine:result.completedLine},{insertBeforeLine:1,text:result.nextLine}]);
});
test('Tasks simple monthly/yearly recurrences clamp calendar dates and when-done uses completion anchor', () => {
  const [monthly] = parse('- [ ] Month end 🔁 every month 📅 2026-01-31');
  assert.match(engine.complete(monthly,'2026-02-10',true).nextLine,/📅 2026-02-28/);
  const [yearly] = parse('- [ ] Leap day 🔁 every year 📅 2024-02-29');
  assert.match(engine.complete(yearly,'2024-03-01',true).nextLine,/📅 2025-02-28/);
  const [whenDone] = parse('- [ ] Water 🔁 every 3 days when done ⏳ 2026-09-01 📅 2026-09-03');
  const result = engine.complete(whenDone,'2026-10-28',true);
  assert.match(result.nextLine,/⏳ 2026-10-29 📅 2026-10-31/);
});
test('Tasks unsupported recurrence cannot silently drop a future occurrence', () => {
  const [task] = parse('- [ ] Unknown schedule 🔁 every full moon 📅 2026-10-30');
  assert.throws(() => engine.complete(task,'2026-10-28',true),/Unsupported recurrence/);
  const [invalid] = parse('- [ ] Invalid 🔁 every month 📅 2026-02-30');
  assert.throws(() => engine.complete(invalid,'2026-10-28',true),/invalid task dates/);
  assert.equal(run([invalid], 'due date is invalid').tasks.length, 1);
});

test('documented weekday and month-day recurrences keep the original date anchor', () => {
  for(const [rule,anchor,expected] of [['every Friday','2026-10-30','2026-11-06'],['every weekday','2026-10-30','2026-11-02'],['every week on Tuesday, Friday','2026-10-30','2026-11-03'],['every month on the last','2026-01-31','2026-02-28'],['every month on the 31st','2026-01-31','2026-03-31'],['every Friday when done','2026-10-30','2026-10-30']]) {
    assert.equal(engine.nextOccurrence(rule,anchor,'2026-10-28'),expected,rule);
  }
});

test('task edits round-trip notes, literal metadata, status, comments and block IDs', () => {
  const [task]=parse('  1. [/] Review `📅 2026-01-01` #work ⏫ 🔁 every Friday 🛫 2026-10-28 📅 2026-10-30 ➕ 2026-10-01 ^review <!-- keep -->');
  const edited=engine.editTask(task,{text:task.text,due:'2026-11-06',start:task.start,scheduled:'2026-11-05',priority:'highest',recurrence:task.recurrence});
  const [next]=parse(edited);
  assert.equal(next.status,'/');assert.equal(next.due,'2026-11-06');assert.equal(next.scheduled,'2026-11-05');assert.equal(next.created,'2026-10-01');assert.equal(next.priority,'highest');
  assert.match(edited,/`📅 2026-01-01`/);assert.match(edited,/\^review <!-- keep -->$/);assert.ok(edited.startsWith('  1. [/]'));
  assert.throws(()=>engine.editTask(task,{text:'Repeat',recurrence:'every day'}),/needs a/);
});

test('source changes reject stale lines, preserve CRLF and insert recurrence above the original', () => {
  const content='# Review\r\n- [ ] Weekly 🔁 every week 📅 2026-10-28\r\nKeep this\r\n',task=parse(content)[0];
  const result=engine.complete(task,'2026-10-28',true),next=engine.applyTaskChange(content,task,result);
  assert.equal(next,'# Review\r\n'+result.nextLine+'\r\n'+result.completedLine+'\r\nKeep this\r\n');
  assert.throws(()=>engine.applyTaskChange('Inserted\r\n'+content,task,result),/moved or changed/);
});

test('queries support headings, filenames, relative happens dates and boolean filters', () => {
  const tasks=parse('# Work\n- [ ] Today #work 📅 2026-10-28\n- [ ] Next #home ⏳ 2026-11-01\n# Later\n- [ ] Unscheduled #work');
  assert.equal(run(tasks,'filename includes Notes\nheading includes Work\nhappens before in 7 days').tasks.length,2);
  const result=run(tasks,'not done\n(due today) OR (tags include #home)\ngroup by filename\nsort by description\nexplain');
  assert.equal(result.tasks.length,2);assert.equal(result.groups[0].name,'Notes');assert.match(result.explanation,/due today/);
  assert.equal(run(tasks,'NOT (tags include #work)').tasks.length,1);
  assert.equal(run(tasks,'(due today) OR (unsupported filter)').tasks.length,0);
  assert.equal(run(tasks,'(due today) nonsense').tasks.length,0);
});
