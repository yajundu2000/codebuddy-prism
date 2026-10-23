/**
 * GB/T 7714-2025 parsing (the Cite tab's paste box). Pure-function table:
 * every shape CNKI exports that a thesis bibliography realistically carries.
 */
import { check, eq } from './assert.mjs';

const { parseGbt7714 } = await import('../src/references.ts');

const fieldsOf = (o) => Object.fromEntries(o.fields.map((f) => [f.name, f.value]));

// The citation from the feature request.
const user = parseGbt7714('[1]董丁槊,刘荣.《黑神话：悟空》对外传播效果探究——基于YouTube视频评论的情感分析[J].新传奇,2026,(37):47-49.DOI:10.26938/j.cnki.CN42-1794/Z.2026.37.015.');
check(user != null, 'the request citation parses');
eq(user.type, 'article', 'journal → article');
eq(user.key, 'XCQ202637047', 'CNKI-style pinyin key: 新传奇→XCQ + 2026 + 37 + 047');
eq(fieldsOf(user).title, '《黑神话：悟空》对外传播效果探究——基于YouTube视频评论的情感分析', 'title keeps 《》 and ——');
eq(fieldsOf(user).author, '董丁槊 and 刘荣', 'authors joined with and, no reorder');
eq(fieldsOf(user).journaltitle, '新传奇', 'journal name');
eq(fieldsOf(user).number, '37', 'issue');
eq(fieldsOf(user).pages, '47-49', 'pages');
eq(fieldsOf(user).doi, '10.26938/j.cnki.CN42-1794/Z.2026.37.015', 'DOI with internal dots, trailing period stripped');
check(!('volume' in fieldsOf(user)), 'no empty volume field');

// Volume + issue, 等 truncation, no serial number.
const vol = parseGbt7714('王五,等.深度学习方法研究[J].计算机学报,2023,46(5):1-15.');
eq(vol.key, 'JSJX202305001', 'volume form: 计算机学报→JSJX + 2023 + 05 + 001');
eq(fieldsOf(vol).volume, '46', 'volume');
eq(fieldsOf(vol).author, '王五 and others', '等 → and others');

// Monograph: place:publisher,year:pages.
const book = parseGbt7714('李四.机器学习导论[M].北京:清华大学出版社,2020:88-92.');
eq(book.type, 'book', 'monograph → book');
eq(book.key, 'QHDX202000088', 'publisher initials 清华大学出版社→QHDX');
eq(fieldsOf(book).publisher, '清华大学出版社', 'publisher');
eq(fieldsOf(book).address, '北京', 'place → address');
eq(fieldsOf(book).pages, '88-92', 'book pages');

// Dissertation: place:school,year; 硕士 → mastersthesis.
const phd = parseGbt7714('张三.高光谱遥感图像去条带方法研究[D].南京:南京邮电大学,2020.');
eq(phd.type, 'phdthesis', 'dissertation → phdthesis');
eq(fieldsOf(phd).school, '南京邮电大学', 'place prefix stripped from school');
eq(phd.key, 'NJYD202000000', '南京邮电大学→NJYD, no pages → 000');
const master = parseGbt7714('赵六.面向问答的检索模型研究[D].杭州:浙江大学硕士,2021.');
eq(master.type, 'mastersthesis', 'a school naming 硕士 → mastersthesis');

// Conference.
const conf = parseGbt7714('Alice B, Carol D. Great papers[C].Proceedings of Things,2019:1-10.');
eq(conf.type, 'inproceedings', 'conference → inproceedings');
eq(fieldsOf(conf).booktitle, 'Proceedings of Things', 'booktitle');

// Online resource: url + 引文日期 → urldate.
const eb = parseGbt7714('某某网.数据报告[EB/OL].(2024-01-01)[2025-06-30].https://example.org/report.引文日期:2025-06-30.');
check(eb != null, 'EB/OL parses');
eq(fieldsOf(eb).url, 'https://example.org/report', 'url captured, stops before 引文日期');
eq(fieldsOf(eb).urldate, '2025-06-30', '引文日期 → urldate');

// English citation in GB/T layout, fullwidth-tolerant delimiters.
const en = parseGbt7714('Smith J，Lee K．A study of things[J]．Nature，2019，100(2)：50-60．DOI：10.1038/xyz．');
eq(en.key, 'N201902050', 'Latin source → word initials (Nature → N)');
eq(fieldsOf(en).journaltitle, 'Nature', 'english journal');
eq(fieldsOf(en).doi, '10.1038/xyz', 'fullwidth DOI： tolerated');

// Missing issue still yields a key and no number field.
const noIssue = parseGbt7714('陈七.短文[J].读书,2018:3-4.');
check(noIssue != null && noIssue.key === 'DS201800003', 'no issue → 00 segment');
check(!('number' in fieldsOf(noIssue)), 'no empty number field');

// Refuse what carries no type marker — the 422 path.
eq(parseGbt7714('随便一段没有标记的文字'), null, 'no marker → null');
eq(parseGbt7714(''), null, 'empty → null');
eq(parseGbt7714('[J]'), null, 'marker alone (no title) → null');

console.log('gbt7714: all assertions passed');
