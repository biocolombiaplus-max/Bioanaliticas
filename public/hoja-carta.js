/* Motor de hojas tamaño carta para los informes.
   - paginar: reparte bloques en hojas de alto fijo; un bloque nunca se parte y, si no cabe, pasa completo a la hoja siguiente.
     Las secciones van seguidas, sin dejar hojas a medio llenar.
   - escalar: en el celular la hoja se ve completa, a escala.
   - descargarPDF: genera un PDF carta real hoja por hoja (iPhone: guardar o compartir). */
const HC = {
  // bloques: [{ html, nueva?, compacto? }] o strings; compacto es una versión más baja que se usa si así cabe en la hoja. head/pie: HTML del encabezado y pie de cada hoja.
  paginar(doc, bloques, { head = '', pie = '' } = {}) {
    let pb = null;
    const nueva = () => {
      const s = document.createElement('section');
      s.className = 'page';
      s.innerHTML = `${head}<div class="pb"></div><div class="pf">${pie}<span class="pn"></span></div>`;
      doc.appendChild(s);
      pb = s.querySelector('.pb');
    };
    const desborda = () => pb.scrollHeight > pb.clientHeight + 1;
    for (const b of bloques) {
      const { html, nueva: forzar, compacto } = typeof b === 'string' ? { html: b } : b;
      if (!html) continue;
      if (!pb || (forzar && pb.children.length)) nueva();
      const d = document.createElement('div');
      d.className = 'blk';
      d.innerHTML = html;
      pb.appendChild(d);
      if (desborda() && pb.children.length > 1) {
        // Antes de pasar a otra hoja, prueba una versión más compacta del bloque (p. ej. fotos más bajas).
        if (compacto) { d.innerHTML = compacto; if (!desborda()) continue; d.innerHTML = html; }
        d.remove(); nueva(); pb.appendChild(d);
      }
    }
  },
  numerar(doc) {
    const pn = doc.querySelectorAll('.page:not(.cover) .pn');
    pn.forEach((el, i) => { el.textContent = `Página ${i + 1} de ${pn.length}`; });
  },
  // Reduce la letra de un recuadro hasta que su texto quepa.
  encajar(el, min = 9) {
    if (!el) return;
    el.style.fontSize = '';
    let fs = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollHeight > el.clientHeight + 1 && fs > min) { fs -= 0.5; el.style.fontSize = fs + 'px'; }
  },
  escalar(doc) {
    const z = Math.min(1, (window.innerWidth - 16) / 816);
    doc.style.zoom = z < 1 ? z.toFixed(3) : '';
  },
  // Lienzo con tamaño fijo tomado de su contenedor (el gráfico sale igual en pantalla, impresión y PDF).
  lienzo(id) {
    const cv = typeof id === 'string' ? document.getElementById(id) : id, p = cv.parentElement;
    cv.width = p.clientWidth; cv.height = p.clientHeight;
    cv.style.width = p.clientWidth + 'px'; cv.style.height = p.clientHeight + 'px';
    return cv;
  },
  async descargarPDF(doc, nombre) {
    if (!window.html2canvas || !window.jspdf) { window.print(); return; }
    let velo = document.getElementById('velo');
    if (!velo) { velo = document.createElement('div'); velo.id = 'velo'; velo.className = 'velo'; document.body.append(velo); }
    velo.hidden = false; velo.textContent = 'Preparando el PDF…';
    const zoom = doc.style.zoom; doc.style.zoom = '';
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const hojas = [...doc.querySelectorAll('.page')];
      const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'letter', compress: true });
      for (let i = 0; i < hojas.length; i++) {
        velo.textContent = `Generando PDF… hoja ${i + 1} de ${hojas.length}`;
        const cv = await html2canvas(hojas[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
        if (i) pdf.addPage('letter');
        pdf.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 215.9, 279.4, undefined, 'FAST');
      }
      const blob = pdf.output('blob');
      const file = new File([blob], nombre, { type: 'application/pdf' });
      const movil = /iPhone|iPad|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
      if (movil && navigator.canShare && navigator.canShare({ files: [file] })) {
        velo.innerHTML = `<div>PDF listo ✓<br><button id="v-share" style="margin-top:14px;font:inherit;font-weight:600;border:0;border-radius:999px;padding:12px 22px;background:#e0661f;color:#fff">Guardar o compartir</button><br><button id="v-x" style="margin-top:10px;font:inherit;border:0;background:none;color:#fff;opacity:.8">Cerrar</button></div>`;
        await new Promise(res => {
          document.getElementById('v-share').onclick = async () => { try { await navigator.share({ files: [file], title: nombre }); } catch { /* cancelado */ } res(); };
          document.getElementById('v-x').onclick = res;
        });
      } else pdf.save(nombre);
    } catch (e) {
      velo.hidden = true; doc.style.zoom = zoom;
      throw new Error('No se pudo generar el PDF: ' + e.message + '. Usa "Imprimir" y elige "Guardar como PDF".');
    }
    velo.hidden = true;
    HC.escalar(doc);
  },
};
