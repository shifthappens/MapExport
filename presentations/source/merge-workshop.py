from pathlib import Path
from copy import deepcopy
from lxml import etree as E
import zipfile
import sys
if len(sys.argv)!=4: raise SystemExit('Usage: merge-workshop.py source-14-slides.pptx workshop-slide.pptx output.pptx')
a=zipfile.ZipFile(sys.argv[1]); b=zipfile.ZipFile(sys.argv[2])
assert len(E.fromstring(a.read('ppt/presentation.xml')).findall('.//{http://schemas.openxmlformats.org/presentationml/2006/main}sldId'))==14, 'Expected the edited 14-slide source deck'
P='http://schemas.openxmlformats.org/presentationml/2006/main'; A='http://schemas.openxmlformats.org/drawingml/2006/main'; R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'; PK='http://schemas.openxmlformats.org/package/2006/relationships'
ns={'p':P,'a':A,'r':R}; changes={}; removed=set()
def read(f): return E.fromstring(a.read(f))
def save(f,r): changes[f]=E.tostring(r,xml_declaration=True,encoding='UTF-8',standalone=True)
r=read('ppt/slides/slide11.xml'); fresh=E.fromstring(b.read('ppt/slides/slide1.xml'))
r.replace(r.find('p:cSld',ns),deepcopy(fresh.find('p:cSld',ns)))
# Only the footer lies at the far right near the bottom.
for sp in r.findall('.//p:sp',ns):
 off=sp.find('p:spPr/a:xfrm/a:off',ns)
 if off is not None and int(off.get('x'))>11000000 and int(off.get('y'))>6000000:
  sp.find('.//a:t',ns).text='11'
rels=read('ppt/slides/_rels/slide11.xml.rels')
for label,url,rid in [('coen.at/ghent.svg','https://coen.at/ghent.svg','rIdDemo'),('coen.at/mapexport','https://coen.at/mapexport/','rIdTool')]:
 rel=E.SubElement(rels,'{'+PK+'}Relationship',Id=rid,Type=R+'/hyperlink',Target=url,TargetMode='External')
 for t in r.findall('.//a:t',ns):
  if t.text==label:
   run=t.getparent(); rp=run.find('a:rPr',ns)
   if rp is None: rp=E.Element('{'+A+'}rPr');run.insert(0,rp)
   rp.set('u','sng'); E.SubElement(rp,'{'+A+'}hlinkClick',{'{'+R+'}id':rid})
save('ppt/slides/slide11.xml',r);save('ppt/slides/_rels/slide11.xml.rels',rels)
# Keep original note placeholders and replace just the speaker-note body.
n=read('ppt/notesSlides/notesSlide11.xml'); note=E.fromstring(b.read('ppt/notesSlides/notesSlide1.xml'))
newbody=next(sp.find('p:txBody',ns) for sp in note.findall('.//p:sp',ns) if sp.find('.//p:ph',ns) is not None and sp.find('.//p:ph',ns).get('type')=='body')
for sp in n.findall('.//p:sp',ns):
 ph=sp.find('.//p:ph',ns)
 if ph is not None and ph.get('type')=='body':sp.replace(sp.find('p:txBody',ns),deepcopy(newbody))
save('ppt/notesSlides/notesSlide11.xml',n)
# Remove the two superseded slides and their notes, preserving all other parts.
pr=read('ppt/presentation.xml'); rr=read('ppt/_rels/presentation.xml.rels')
for rel in list(rr):
 if rel.get('Target') in ['slides/slide12.xml','slides/slide13.xml']:
  for sid in list(pr.find('p:sldIdLst',ns)):
   if sid.get('{'+R+'}id')==rel.get('Id'):pr.find('p:sldIdLst',ns).remove(sid)
  rr.remove(rel)
for i in [12,13]:
 removed.update([f'ppt/slides/slide{i}.xml',f'ppt/slides/_rels/slide{i}.xml.rels',f'ppt/notesSlides/notesSlide{i}.xml',f'ppt/notesSlides/_rels/notesSlide{i}.xml.rels'])
save('ppt/presentation.xml',pr);save('ppt/_rels/presentation.xml.rels',rr)
r=read('[Content_Types].xml')
for x in list(r):
 if (x.get('PartName') or '').lstrip('/') in removed:r.remove(x)
save('[Content_Types].xml',r)
r=read('ppt/slides/slide14.xml')
for sp in r.findall('.//p:sp',ns):
 off=sp.find('p:spPr/a:xfrm/a:off',ns)
 if off is not None and int(off.get('x'))>11000000 and int(off.get('y'))>6000000:sp.find('.//a:t',ns).text='12'
save('ppt/slides/slide14.xml',r)
r=read('docProps/app.xml'); EP='http://schemas.openxmlformats.org/officeDocument/2006/extended-properties';V='http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes'
for tag in ['Slides','Notes']:r.find('{'+EP+'}'+tag).text='12'
vs=r.find('{'+EP+'}HeadingPairs/{'+V+'}vector')
for i,x in enumerate(vs):
 if x.find('{'+V+'}lpstr') is not None and x.find('{'+V+'}lpstr').text=='Slide Titles':vs[i+1].find('{'+V+'}i4').text='12'
v=r.find('{'+EP+'}TitlesOfParts/{'+V+'}vector'); v.remove(v[-2]);v.remove(v[-2]);v.set('size',str(len(v)))
save('docProps/app.xml',r)
with zipfile.ZipFile(sys.argv[3],'w',zipfile.ZIP_DEFLATED) as z:
 for name in a.namelist():
  if name not in removed:z.writestr(name,changes.get(name,a.read(name)))
print('Merged to 12 slides. Slides 1–10 and all their assets/notes remain byte-identical.')
