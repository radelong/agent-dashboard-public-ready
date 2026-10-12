import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {extract} from '../bridge/knowledge.mjs';
const python=process.env.PYTHON_PATH || 'python';
test('PDF, DOCX tables, slide text and spreadsheet rows retain source locations; scans fail explicitly',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hub-formats-'));
 const generate=`import sys, os
from docx import Document
from pptx import Presentation
from openpyxl import Workbook
from reportlab.pdfgen import canvas
p=sys.argv[1]
d=Document(); d.add_paragraph('Engine inspection every six months.'); t=d.add_table(rows=1, cols=2); t.cell(0,0).text='Coolant'; t.cell(0,1).text='Service'; d.save(os.path.join(p,'source.docx'))
r=Presentation(); s=r.slides.add_slide(r.slide_layouts[1]); s.shapes.title.text='Maintenance'; s.placeholders[1].text='Engine inspection every six months.'; r.save(os.path.join(p,'source.pptx'))
w=Workbook(); w.active.title='Maintenance'; w.active.append(['Engine inspection','six months']); w.save(os.path.join(p,'source.xlsx'))
c=canvas.Canvas(os.path.join(p,'source.pdf')); c.drawString(50,750,'Engine inspection every six months.'); c.showPage(); c.save()
c=canvas.Canvas(os.path.join(p,'scan.pdf')); c.rect(40,40,20,20); c.showPage(); c.save()
`;
 try{await promisify(execFile)(python,['-c',generate,root],{windowsHide:true});for(const [ext,location]of [['pdf','Page 1'],['docx','Block 1'],['pptx','Slide 1'],['xlsx','Maintenance, row 1']]){const out=await extract(await fs.readFile(path.join(root,'source.'+ext)),ext,python);assert(out.sections.some(s=>s.text.includes('Engine inspection')&&s.location===location));if(ext==='docx')assert(out.sections.some(s=>s.text.includes('Coolant')));}
 await assert.rejects(extract(await fs.readFile(path.join(root,'scan.pdf')),'pdf',python),/OCR/);
 }finally{assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true,force:true});}
});
