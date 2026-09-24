import fs from 'fs';
const s = fs.readFileSync('server.js','utf8');
const keys = ['{','}','(',')','[',']','`','"',"'"];
const counts = {};
for(const k of keys) counts[k]=0;
for(let i=0;i<s.length;i++){
  const c=s[i];
  if(c in counts) counts[c]++;
}
console.log(counts);
