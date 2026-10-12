import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it} from 'vitest';

// Exercise localization in Node; no browser or additional DOM package is needed.
function filmLocale(strings){
 const nodes=strings.map(textContent=>({textContent,parentElement:{tagName:'BUTTON'}}));
 const attributes={ 'aria-label':'Try Research',alt:'Open Research' };
 const element={hasAttribute:key=>key in attributes,getAttribute:key=>attributes[key],setAttribute:(key,value)=>{attributes[key]=value}};
 const document=Object.assign(new EventTarget(),{
  documentElement:{lang:'en'},
  createTreeWalker:()=>{let index=0;return {currentNode:null,nextNode(){this.currentNode=nodes[index++];return Boolean(this.currentNode)}}},
  querySelectorAll:()=>[element],
 });
 const scope={document,NodeFilter:{SHOW_TEXT:4}};
 const source=readFileSync(new URL('./locale.js',import.meta.url),'utf8').replaceAll('export function','function');
 runInNewContext(source,scope);
 const change=locale=>document.dispatchEvent(new CustomEvent('opsis:locale',{detail:{locale}}));
 return {nodes,attributes,document,change};
}

describe('front door locale',()=>{
 it('translates the canonical shortcuts and descriptive copy into Simplified Chinese',()=>{
  const f=filmLocale(['Research','Trade Check','Watch','Stock-token check','Quant Lab','World & markets','Saved','Find your tool','Pool atlas','Portfolio surface','No wallet. No sign-up.']);
  f.change('zh-CN');
  expect(f.document.documentElement.lang).toBe('zh-CN');
  expect(f.nodes.map(node=>node.textContent)).toEqual(['研究','交易核查','观察','股票代币核查','量化实验室','世界与市场','已保存','选择工具','资金池图谱','投资组合曲面','无需钱包。无需注册。']);
 });
 it('preserves exact English text and accessibility attributes after a language round trip',()=>{
  const strings=['Try Research','Open Research','  See the bigger  ','picture.'];
  const f=filmLocale(strings);
  f.change('zh-CN');
  expect(f.attributes['aria-label']).toBe('打开研究');
  expect(f.attributes.alt).toBe('打开研究');
  f.change('en');
  expect(f.nodes.map(node=>node.textContent)).toEqual(strings);
  expect(f.attributes).toEqual({'aria-label':'Try Research',alt:'Open Research'});
 });
});
