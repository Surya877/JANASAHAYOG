import fs from 'fs';
const s = fs.readFileSync('server.js','utf8');
let brace=0, paren=0, bracket=0;
const lines = s.split(/\r?\n/);
for(let i=0;i<lines.length;i++){
  const line=lines[i];
  for(const ch of line){
    if(ch==='{') brace++;
    if(ch==='}') brace--;
    if(ch==='(') paren++;
    if(ch===')') paren--;
    if(ch==='[') bracket++;
    if(ch===']') bracket--;
  }
  if(brace<0) console.log('Brace negative at line', i+1);
  if(paren<0) console.log('Paren negative at line', i+1);
  if(bracket<0) console.log('Bracket negative at line', i+1);
}
console.log('final counts', {brace,paren,bracket});
for(let i=0;i<lines.length;i++) console.log((i+1).toString().padStart(4),'|',lines[i]);
