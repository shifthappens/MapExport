/** Rebuild with @oai/artifact-tool. See ../README.md for the runtime setup. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const artifactPath=require.resolve('@oai/artifact-tool');
const {Presentation,PresentationFile}=await import(pathToFileURL(artifactPath));
const {FontLibrary}=await import(pathToFileURL(path.resolve(path.dirname(artifactPath),'../node_modules/skia-canvas/lib/index.js')));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=process.env.BUILD_DIR||'/tmp/mapexport-workshop-merge';
await fs.mkdir(out,{recursive:true});
const fontdir=path.join(root,'references/MapExport Design System/fonts');
for(const [file,family] of [['Mayonnaise_Black','Mayonnaise Black'],['Apfel_Grotezk_Regular','Apfel Grotezk'],['Apfel_Grotezk_Fett','Apfel Grotezk']])FontLibrary.use(family,path.join(fontdir,file+'.ttf'));
const p=Presentation.create({slideSize:{width:1280,height:720}});
const C={cream:'#FEF9E4',orange:'#F4501E',ink:'#18180F',mint:'#7ECAB6',line:'#D9D0AE'};
const assets=path.join(root,'presentations/assets');
const source='Sources: live https://coen.at/mapexport/ inspected and exported 13 September 2026; repository README.md, script.js and references/How to draw a good street map.md. Map data © OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/copyright .';
const slides=[];
function text(s,str,x,y,w,h,size=28,color=C.ink,font='Apfel Grotezk',bold=false){const t=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});t.text=str;t.text.style={typeface:font,fontSize:size,color,bold,autoFit:'none'};return t;}
function box(s,x,y,w,h,fill){return s.shapes.add({geometry:'rect',position:{left:x,top:y,width:w,height:h},fill,line:{fill:'none',width:0}});}
async function img(s,file,x,y,w,h,fit='cover'){s.images.add({blob:await fs.readFile(path.join(assets,file)),contentType:'image/png',alt:file.replaceAll('-',' '),fit,position:{left:x,top:y,width:w,height:h}});}
function base(title,kicker='WORKSHOP',bg=C.cream){const s=p.slides.add();s.background.fill=bg;const n=p.slides.items.length;slides.push({title});text(s,kicker,48,25,1136,30,17,bg===C.orange?C.cream:C.orange,'Apfel Grotezk',true);text(s,title,48,67,1180,112,55,bg===C.orange?C.cream:C.ink,'Mayonnaise Black');text(s,'MAPEXPORT  /  USE-IT     ·     Map data © OpenStreetMap contributors',48,675,1050,25,15,bg===C.orange?C.cream:C.ink);text(s,String(n).padStart(2,'0'),1170,675,62,25,15,bg===C.orange?C.cream:C.ink);return s;}
function notes(s,content){s.speakerNotes.textFrame.setText(content+'\n\n'+source);}
function row(s,num,title,body,y,w=1080){text(s,num,48,y,72,58,40,C.orange,'Mayonnaise Black');text(s,title,132,y,w-84,42,30,C.ink,'Apfel Grotezk',true);text(s,body,132,y+46,w-84,67,26);}

const s=base('YOUR CITY. YOUR TURN.','HANDS-ON / 20 MINUTES');
text(s,'coen.at/mapexport',48,156,1160,54,35,C.orange,'Apfel Grotezk',true);
row(s,'01','Export a small area','Choose your SVG format. Open it in Illustrator or Inkscape.',233,1160);
row(s,'02','Explore and edit','Recolour the city blocks. Toggle a layer. Find a street label.',348,1160);
row(s,'03','Save a working copy','Keep one observation to share with the group.',463,1160);
box(s,48,580,1184,66,C.mint);
text(s,'Export still running? Use the demo:',65,592,730,44,27,C.ink,'Apfel Grotezk',true);
text(s,'coen.at/ghent.svg',855,592,350,44,27,C.ink,'Apfel Grotezk',true);
notes(s,'Keep this slide on screen throughout the hands-on exercise. Allow about 20 minutes. Participants can work individually or in pairs. Start with a small central area and choose the SVG format for the editor. Use File > Open and keep the original download. Select only the City blocks paths before changing Fill. Keep roads and water unchanged. Hide and restore a layer, then find a street label. Save a separate working copy and note one concrete observation for the discussion. Done early? Compare the map with a place you know well. If an export is delayed, use https://coen.at/ghent.svg (local backup: presentations/assets/ghent-demo.svg). Watch the progress message and try a smaller area next time. If the file looks unexpected, check SVG format, fonts and layer visibility. Useful bug reports include city, area, editor and expected result.');
await (await PresentationFile.exportPptx(p)).save(path.join(out,'workshop-slide.pptx'));
await fs.writeFile(path.join(out,'workshop-slide.png'),new Uint8Array(await (await p.export({slide:s,format:'png',scale:1})).arrayBuffer()));
