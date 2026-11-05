import test from 'node:test';
import assert from 'node:assert/strict';
import {linkNoteImages,UPLOAD_URL_PREFIX as P} from '../src/note-images.ts';

const upload=(id,name,section='projects',type='image/png')=>({id,section,name,type,size:1,addedAt:'2026-11-04T00:00:00.000Z'});

test('an absolute path with spaces links to the gallery file with that name',()=>{
  const body='Before\n\n![shot](/Users/me/Library/Application Support/images/screen shot 4.21.png)\n\nAfter';
  assert.equal(linkNoteImages(body,'projects',[upload('a','screen shot 4.21.png')]),`Before\n\n![shot](${P}a)\n\nAfter`);
});
test('an HTML image tag links to the gallery and keeps its alt text',()=>{
  assert.equal(linkNoteImages('<img src="/x/kafka-project.svg" alt="kafka" style="zoom:200%;" />','projects',[upload('a','kafka-project.svg','projects','image/svg+xml')]),`![kafka](${P}a)`);
});
test('encoded paths, titles, and parentheses in filenames are handled',()=>{
  assert.equal(linkNoteImages('![a](./images/my%20shot.png "Title")','projects',[upload('a','my shot.png')]),`![a](${P}a)`);
  assert.equal(linkNoteImages('![a](/x/shot (1).png)','projects',[upload('a','shot (1).png')]),`![a](${P}a)`);
});
test('the file in the note\'s own section wins over one with the same name elsewhere',()=>{
  const uploads=[upload('other','a.png','behavioral'),upload('mine','a.png','projects')];
  assert.equal(linkNoteImages('![](a.png)','projects',uploads),`![](${P}mine)`);
  assert.equal(linkNoteImages('![](a.png)','reflections',uploads),`![](${P}other)`);
});
test('remote images, unmatched images, and non-image uploads are left alone',()=>{
  const uploads=[upload('a','a.png'),upload('b','b.pdf','projects','application/pdf')];
  for(const body of ['![](https://example.com/a.png)','![](missing.png)','![](b.pdf)','[link](a.png)'])
    assert.equal(linkNoteImages(body,'projects',uploads),body);
});
test('code examples stay as written',()=>{
  const uploads=[upload('a','a.png')];
  for(const body of ['Use `![x](a.png)` here','```md\n![x](a.png)\n```'])
    assert.equal(linkNoteImages(body,'projects',uploads),body);
  assert.equal(linkNoteImages('```\n![x](a.png)\n```\n![x](a.png)','projects',uploads),`\`\`\`\n![x](a.png)\n\`\`\`\n![x](${P}a)`);
});
