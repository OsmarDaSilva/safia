/* SAFIA — Materiales: variedades de soja e híbridos de maíz
   -------------------------------------------------------------------
   Qué sabe SAFIA de cada material y por qué el material cambia el rinde. Todo con fuente:
   - Soja: grupo de madurez relativa (GMR), hábito de crecimiento y sanidad, de la página del obtentor o de un
     distribuidor (se indica cuál). Recomendación de GMR por región: INBIO (Paraguay).
   - Maíz: ciclo, madurez relativa y grados-día (GDU) de la ficha de la empresa, y la clasificación oficial de
     SENAVE para Paraguay (campaña 2024/25), que a veces no coincide con la de Brasil: se muestran las dos.
   - Ensayos con rinde por material: IPTA (soja, 6 localidades de Paraguay, datos hasta la zafra 2024) y
     Fundação MS (maíz safrinha 2026 en Ponta Porã, Rio Brilhante y Anaurilândia). Copia del 28-sep-2026.
   Lo que no se pudo verificar NO está: SAFIA dice "sin dato verificado", nunca deduce el grupo del nombre.
   Uso: SafiaMateriales.buscar(cultivo, nombre) · lectura(mio, ref) · ensayosHTML(mio, ref) · notaHTML(cultivo) · corto(cultivo, nombre) */
(function () {
  'use strict';
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, d) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-PY', { maximumFractionDigits: d == null ? 0 : d }); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function clave(s) { return norm(s).replace(/[^a-z0-9]/g, ''); }
  // nombre sin la tecnología (IPRO, RR, PRO3, VYHR…): el mismo material con otra biotecnología tiene el mismo ciclo
  var SUFIJOS = /(ipro|i2x|rsf|sts|rr|rg|ce|pro[234]|vyhr|vyh|yhr|vyr|pwu|vip3|vt3p|tre|hr|pw)$/;
  function base(s) { var k = clave(s), prev; do { prev = k; k = k.replace(SUFIJOS, ''); } while (k !== prev && k.length > 3); return k; }
  function cultivoClave(c) { var n = norm(c); return n.indexOf('soj') === 0 ? 'soja' : (n.indexOf('maiz') === 0 ? 'maiz' : n); }

  /* ---------- fuentes ---------- */
  var F = {
    embrapaSoja: { n: 'Embrapa Soja, Tecnologias de produção de soja (Sistemas de Produção 17, 2020)', url: 'https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1123928/1/SP-17-2020-online-1.pdf' },
    fundacaoMS: { n: 'Fundação MS, Tecnologia e Produção: Soja 2018/2019', url: 'https://www.fundacaoms.org.br/wp-content/uploads/2021/02/Tecnologia-e-Producao-Soja-Safra-20182019.pdf' },
    inbio: { n: 'INBIO, herramienta de selección de variedades de soja por regiones de Paraguay', url: 'https://inbio.org.py/congreso-del-saa-se-presento-una-herramienta-tecnica-que-facilita-la-seleccion-de-variedades-de-soja-por-regiones-de-paraguay/' },
    ideagro: { n: 'Fundación IDEAGRO, Red de ensayos REEI 2025/26 (Chaco)', url: 'https://ideagro.org.py/wp-content/uploads/2026/09/Informe-de-Resultados-REEI-2025_26-1.pdf' },
    abcChaco: { n: 'ABC Color, 31-ene-2021 (Ing. Carlos Passerieu), fuente periodística', url: 'https://www.abc.com.py/nacionales/2021/01/31/resaltan-potencial-para-el-desarrollo-de-cultivos-agricolas-en-el-chaco/' },
    embrapaMilhoPasso: { n: 'Embrapa, Passo a passo na escolha da cultivar de milho (2012)', url: 'https://www.infoteca.cnptia.embrapa.br/bitstream/doc/954508/1/PassoaPassonaEscolhadacultivardeMilho.pdf' },
    embrapaMilho2010: { n: 'Embrapa Milho e Sorgo, Sistemas de Produção 2, 6ª ed. (2010), Plantio', url: 'https://ainfo.cnptia.embrapa.br/digital/bitstream/item/27037/1/Plantio.pdf' },
    embrapaDoc272: { n: 'Embrapa, Documentos 272: Cultivares de milho para a safra 2022/2023', url: 'https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1150188/1/Documentos-272-Cultivares-de-milho-para-safra-2022-2023.pdf' },
    embrapaSilagem: { n: 'Embrapa Gado de Leite, Comunicado Técnico 74 (2014), silaje de maíz', url: 'http://ainfo.cnptia.embrapa.br/digital/bitstream/item/105773/1/COT-74-Persio-Producao-de-Silagem-de-Milho-para-Suplementacao-do-Rebanho-Leiteiro.pdf' },
    senave: { n: 'SENAVE, lista de testigos de variedades e híbridos de maíz, campaña 2024/2025', url: 'https://www.senave.gov.py/docs/semillas/proteccionyusovariedades/LISTA%20%20DE%20TESTIGOS%20DE%20VARIEDADES%20E%20HIBRIDOS%20DE%20MAIZ%20campana%202024-2025.pdf' },
    ipta: { n: 'IPTA, Informe online de las variedades comerciales de soja del Paraguay (Abbate, Lázaro, Urunaga; hasta la zafra 2024)', url: 'https://cultivaresparaguayos.com/soja/' },
    fmsMilho: { n: 'Fundação MS, Rede de Validação de Híbridos de Milho Safrinha 2026', url: 'https://resultados.fundacaoms.org.br/' }
  };

  /* ---------- soja: [nombre, GMR, hábito, sanidad, url, nivel de la fuente, nota] ---------- */
  var SOJA = [
    ['BMX Zeus IPRO', 5.5, 'indeterminado', '', 'https://brasmaxgenetica.com.br/cultivares/zeusipro', 'obtentor'],
    ['BMX Potência RR', 6.7, 'indeterminado', '', 'http://www.granjaguara.com.br/produtos/18/bmx-potencia', 'distribuidor'],
    ['BMX Lança IPRO', 5.8, 'indeterminado', '', 'https://brasmaxgenetica.com.br/cultivares/lancaipro', 'distribuidor', 'la página del obtentor muestra "58g" (error de tipeo); 5.8 según distribuidores'],
    ['BMX Bônus IPRO', 7.9, 'indeterminado', '', 'https://brasmaxgenetica.com.br/cultivares/bonusipro', 'obtentor'],
    ['BMX Olimpo IPRO', 7.8, 'indeterminado', '', 'https://brasmaxgenetica.com.br/cultivares/brasmax-olimpo-ipro', 'obtentor', 'entre 7.7 y 8.0 según la región de Brasil'],
    ['BMX Fibra IPRO', 6.4, 'indeterminado', '', 'https://brasmaxgenetica.com.br/cultivares/fibraipro', 'obtentor'],
    ['BMX Compacta IPRO', 6.5, 'indeterminado', '', 'https://brasmaxgenetica.com.br/cultivares/compactaipro', 'obtentor'],
    ['BMX Garra IPRO', 6.3, '', '', 'https://www.centrosulcereais.com.br/post/cultivar-brasmax-garra-ipro-26', 'distribuidor', 'la misma variedad figura como 63I64 RSF IPRO (IPTA) y DM Garra IPRO STS (Don Mario Paraguay)'],
    ['DM 53i54 IPRO', 5.4, 'indeterminado', '', 'https://www.centrosulcereais.com.br/post/cultivar-dm-53i54-ipro-44', 'distribuidor'],
    ['DM 5958 IPRO', 5.8, 'indeterminado', '', 'https://www.centrosulcereais.com.br/post/cultivar-dm-5958-ipro-84', 'distribuidor'],
    ['DM 60i62 IPRO', null, 'indeterminado', '', 'https://www.busanello.com.py/productos/donmario-60i62-ipro', 'distribuidor', 'dos distribuidores paraguayos no coinciden: 5.8 y 6.0'],
    ['DM 66i68 IPRO', 6.6, 'indeterminado', '', 'https://www.jotabasso.com.br/sementes/soja/dm-66i68-rsf-ipro', 'distribuidor'],
    ['NS 5933 IPRO', 6.1, '', '', 'https://www.uniagronegocios.com.br/produtos/detalhe/semente-de-soja-nidera-ns5933ipro', 'distribuidor'],
    ['NS 6010 IPRO', 6.0, 'indeterminado', 'resistente a nematodo de quiste y a Meloidogyne javanica', 'https://www.niderasementes.com.br/portfolio/ns-6010-ipro/', 'obtentor'],
    ['NS 7209 IPRO', 7.2, 'indeterminado', 'susceptible a nematodo de quiste y de agallas', 'http://www.sementesouroverde.com.br/views/soja_ns_7209_ipro.php', 'distribuidor'],
    ['M 5892 IPRO', 5.7, 'semideterminado', '', 'https://www.sementesfalcao.agr.br/produtos/m-5892-ipro', 'distribuidor'],
    ['M 5917 IPRO', 5.9, '', '', 'https://www.centrosulcereais.com.br/post/cultivar-m-5917-ipro-70', 'distribuidor'],
    ['M 5947 IPRO', 5.9, 'indeterminado', '', 'https://agrotec.com.py/semillas/soja/monsoy-m5947-ipro/', 'distribuidor'],
    ['M 6210 IPRO', 6.2, 'indeterminado', '', 'http://www.sementesouroverde.com.br/views/soja_m_6210_ipro.php', 'distribuidor'],
    ['M 6410 IPRO', 6.4, 'indeterminado', '', 'https://agrotec.com.py/semillas/soja/monsoy-m6410-ipro/', 'distribuidor'],
    ['TMG 7062 IPRO', 6.2, 'semideterminado', 'resistente a roya asiática (Inox)', 'https://www.tmg.agr.br/cultivar/tmg-7062-ipro/', 'obtentor'],
    ['TMG 7063 IPRO', 6.3, 'indeterminado', 'resistente a roya asiática (Inox)', 'https://www.agrolink.com.br/sementes/cultivar/tmg-7063-ipro_1744.html', 'distribuidor', '6.3 en el sur de Brasil, 7.0 en el Cerrado'],
    ['TMG 7067 IPRO', 6.5, 'semideterminado', 'resistente a roya asiática (Inox)', 'https://www.tmg.agr.br/cultivar/tmg-7067-ipro/', 'obtentor', '6.5 en el sur de Brasil, 7.0 en el Cerrado'],
    ['TMG 2378 IPRO', 7.8, 'semideterminado', 'resistente a nematodo de quiste (razas 1 y 3)', 'https://www.tmg.agr.br/cultivar/tmg-2378-ipro/', 'obtentor'],
    ['P95R51', 5.1, 'indeterminado', '', 'https://www.pioneer.com/content/dam/dpagco/pioneer/la/br/pt/files/Doc-%20Guia_Soja_Pioneer-LA-BR-v1.pdf', 'obtentor'],
    ['P96Y90', 6.9, 'indeterminado', 'moderadamente tolerante a nematodo de quiste (razas 3 y 14); buena tolerancia a nematodo de agallas', 'https://www.pioneer.com/br/portfolio-de-produtos/soja/96Y90.html', 'obtentor'],
    ['P96R29 IPRO', 6.2, 'indeterminado', '', 'https://www.pioneer.com/br/portfolio-de-produtos/soja/96R29IPRO.html', 'obtentor'],
    ['HO Pirapó IPRO', 6.4, 'indeterminado', 'susceptible a nematodo de quiste y de agallas', 'https://hogenetica.com/main/uploads/2026_01/images/original/ho-pirapo.png', 'obtentor'],
    ['HO Maracaí IPRO', 7.7, 'indeterminado', 'resistente a nematodo de quiste (razas 3, 6, 9, 10 y 14)', 'https://agrosolsementes.com.br/ho-maracai/', 'distribuidor'],
    ['NEO 610 IPRO', 6.1, 'indeterminado', '', 'https://www.neogensementes.com.br/neo-610/', 'obtentor', 'dato de la versión Intacta (IPRO); la versión I2X no se encontró'],
    ['NEO 590 IPRO', 5.9, '', '', 'https://www.neogensementes.com.br/neo-590/', 'obtentor'],
    ['NEXUS 64iX66 I2X', 6.4, 'indeterminado', 'resistente a cancro del tallo y a Phytophthora; mancha ojo de rana: 5 de 5 según Dekalpar, pero susceptible según el registro de Agrolink', 'https://dekalpar.com/producto/nexus-64ix66-i2x/', 'distribuidor', 'GDM; en Brasil se vende como Brasmax Nexus I2X (GMR 6.4 y hábito según Agrolink). En Paraguay (Dekalpar): ciclo 120–123 días, 107 cm, siembra del 1-sep al 30-oct según región con 11–13 pl/m'],
    ['DM 59iX61 I2X', 5.9, '', 'destacada tolerancia a muerte súbita (Agrotec)', 'https://agrotec.com.py/semillas/soja/don-mario-dm-59ix61-i2x/', 'distribuidor', 'ciclo corto, para apertura de siembra en ambientes de alto potencial; lanzamiento 2025/26 de Don Mario (GDM)']
  ];
  var ALIAS_SOJA = { 'nexus': 'nexus64ix66', 'bmxnexus': 'nexus64ix66', 'bmxnexus64ix66': 'nexus64ix66', 'nexus64i66': 'nexus64ix66', '64ix66': 'nexus64ix66', '64i66': 'nexus64ix66', '59ix61': 'dm59ix61', '59i61': 'dm59ix61', 'dm59i61': 'dm59ix61', '63i64': 'bmxgarra', 'dmgarra': 'bmxgarra', 'garra': 'bmxgarra', '96r29': 'p96r29', '64ho114': 'hopirapo', 'pirapo': 'hopirapo', '77ho110': 'homaracai', 'maracai': 'homaracai' };

  /* ---------- maíz: [nombre, ciclo (Brasil, empresa), GM Bayer, GDU a floración, GDU a madurez, ciclo SENAVE Paraguay, url, nivel, nota] ---------- */
  var MAIZ = [
    ['AG 9035 PRO3', 'superprecoz', 133, 920, null, 'precoz para zafriña (AG 9035 PRO4)', 'https://www.agro.bayer.com.br/d/milho-agroceres-ag-9035-pro3-safrinha-subtropical-br', 'obtentor', 'Bayer lo posiciona para ambientes de más de 90 sacas/ha; Embrapa 2022/23: 58–60 mil plantas/ha, grano semidentado'],
    ['P3282 VYH', 'precoz', null, 743, 1515, '', 'https://www.pioneer.com/br/portfolio-de-produtos/milho-todos/P3282VYH.html', 'obtentor', 'Embrapa (Doc. 272) publica 734 GDU para P3282 VYHR'],
    ['P3016 VYHR', 'precoz', null, 748, 1498, '', 'https://www.pioneer.com/br/portfolio-de-produtos/milho-todos/P3016VYHR.html', 'obtentor', 'grano y silaje'],
    ['P4285 VYHR', 'precoz', null, 860, 1615, 'P4285 YHR: normal en zafra', 'https://www.pioneer.com/br/portfolio-de-produtos/milho-todos/P4285VYHR.html', 'obtentor', 'grano y silaje'],
    ['30F35 VYHR', 'precoz', null, 921, 1660, '', 'https://www.pioneer.com/br/portfolio-de-produtos/milho-todos/30F35VYHR.html', 'obtentor', 'grano y silaje'],
    ['P3340 VYHR', 'superprecoz', null, null, null, '', 'https://www.pioneer.com/content/dam/dpagco/pioneer/la/br/pt/files/cat%C3%A1logo_safrinha_download_pdf.pdf', 'obtentor'],
    ['P1972 VYHR', 'hiperprecoz', null, null, null, '', 'https://maissoja.com.br/pioneer-lanca-hibrido-de-milho-p1972vyhr-com-ciclo-hiperprecoce-e-foco-na-regiao-sul-do-pais/', 'prensa', '112–119 días; stay-green'],
    ['P3707 VYH', 'precoz', null, 848, 1610, 'figura como precoz y como normal en zafra', 'https://www.pioneer.com/br/portfolio-de-produtos/milho-todos/P3707VYH.html', 'obtentor'],
    ['P3845 VYHR', 'precoz', null, 810, 1565, 'superprecoz', 'https://www.pioneer.com/br/portfolio-de-produtos/milho-todos/P3845VYHR.html', 'obtentor'],
    ['P3322 PWU', '', null, 815, 1582, '', 'https://www.pioneer.com/br/portfolio-de-produtos/milho-todos/P3322PWU.html', 'obtentor'],
    ['P3565 PWU', '', null, 786, 1522, '', 'https://www.pioneer.com/br/portfolio-de-produtos/milho-todos/P3565PWU.html', 'obtentor'],
    ['DKB 177 TRE', 'precoz', 139, 794, null, '', 'https://www.agro.bayer.com.br/d/milho-dekalb-dkb-177-tre-ver-o-subtropical-br', 'obtentor', 'grano y silaje; dato de la versión TRE'],
    ['DKB 230 PRO3', 'hiperprecoz', 124, 842, null, '', 'https://www.agro.bayer.com.br/d/milho-dekalb-dkb-230-pro3-ver-o-subtropical-br', 'obtentor'],
    ['DKB 255 PRO4', 'precoz', 136, 950, null, 'precoz en zafriña', 'https://www.agro.bayer.com.br/d/milho-dekalb-dkb-255-pro4-safrinha-subtropical-br', 'obtentor'],
    ['DKB 260 PRO4', 'superprecoz', 133, 950, null, 'precoz en zafriña', 'https://www.agro.bayer.com.br/d/milho-dekalb-dkb-260-pro4-safrinha-subtropical-br', 'obtentor'],
    ['DKB 265 PRO3', '', null, null, null, 'superprecoz en zafra y zafriña', F.senave.url, 'oficial PY'],
    ['DKB 290 PRO3', '', null, null, null, 'normal', F.senave.url, 'oficial PY'],
    ['DKB 335 PRO4', 'precoz', 135, null, null, '', 'https://www.agro.bayer.com.br/d/milho-dekalb-dkb-335-pro4-safrinha-subtropical-br', 'obtentor'],
    ['DKB 360 PRO3', 'precoz', 134, 936, null, 'precoz en zafriña', 'https://www.agro.bayer.com.br/d/milho-dekalb-dkb-360-pro3-safrinha-subtropical-br', 'obtentor'],
    ['DKB 390 PRO4', '', 140, 953, null, 'DKB 390 PRO3: superprecoz', 'https://www.agro.bayer.com.br/d/milho-dekalb-dkb-390-pro4-ver-o-tropical-br', 'obtentor', 'GM y GDU de la versión PRO4 en Brasil (verano tropical)'],
    ['AG 8701 PRO4', '', 136, 965, null, 'precoz en zafra', 'https://www.agro.bayer.com.br/d/milho-agroceres-ag-8701-pro4-safrinha-subtropical-br', 'obtentor'],
    ['AG 8480 PRO4', '', 140, null, null, 'precoz en zafriña', 'https://www.agro.bayer.com.br/d/milho-agroceres-ag-8480-pro4-safrinha-subtropical-br', 'obtentor'],
    ['AG 9021 PRO3', 'hiperprecoz', 126, null, null, '', 'https://www.agro.bayer.com.br/d/milho-agroceres-ag-9021-pro3-safrinha-subtropical-br', 'obtentor']
  ];

  /* ---------- índice ---------- */
  var IDX = { soja: {}, maiz: {} };
  SOJA.forEach(function (r) { IDX.soja[base(r[0])] = { nombre: r[0], gm: r[1], habito: r[2], sanidad: r[3], url: r[4], nivel: r[5], nota: r[6] || '' }; });
  MAIZ.forEach(function (r) { IDX.maiz[base(r[0])] = { nombre: r[0], ciclo: r[1], gmBayer: r[2], gduFlor: r[3], gduMad: r[4], senave: r[5], url: r[6], nivel: r[7], nota: r[8] || '' }; });
  function buscar(cultivo, nombre) {
    if (!nombre) return null;
    var cu = cultivoClave(cultivo), t = IDX[cu];
    if (!t) { var r0 = window.SafiaSenave ? window.SafiaSenave.buscar(cultivo, nombre) : null; return r0 ? desdeSenave(cu, r0) : null; }   // trigo, poroto, sorgo…: solo lo inscripto en SENAVE
    var b = base(nombre); if (cu === 'soja' && ALIAS_SOJA[b]) b = ALIAS_SOJA[b];
    var d = t[b] || null;
    if (!d && cu === 'maiz' && /^[0-9]/.test(b)) d = t['p' + b] || null;         // "3282" = "P3282"
    if (!d && cu === 'soja' && /^p?9[0-9][a-z][0-9]/.test(b)) d = t[b.replace(/^p?/, 'p')] || null;   // "96R29" = "P96R29", "96Y90" = "P96Y90"
    var reg = window.SafiaSenave ? window.SafiaSenave.buscar(cultivo, nombre) : null;
    if (!d) return reg ? desdeSenave(cu, reg) : null;
    return Object.assign({ exacto: clave(d.nombre) === clave(nombre), registro: reg }, d);
  }
  // Material que solo está en el registro de SENAVE: se informa lo inscripto; el GM de la soja y los grados-día del maíz quedan sin dato
  function desdeSenave(cu, reg) {
    var F0 = window.SafiaSenave.fuente() || {}, desc = window.SafiaSenave.descripcion(reg);
    if (cu === 'soja') return { nombre: reg.nombre, gm: null, habito: reg.habito || '', sanidad: '', url: F0.url || '', nivel: 'SENAVE', nota: desc, exacto: !!reg.exacto, registro: reg, soloSenave: true };
    if (cu === 'maiz') return { nombre: reg.nombre, ciclo: '', gmBayer: null, gduFlor: null, gduMad: null, senave: desc, url: F0.url || '', nivel: 'SENAVE', nota: '', exacto: !!reg.exacto, registro: reg, soloSenave: true };
    return { nombre: reg.nombre, url: F0.url || '', nivel: 'SENAVE', nota: desc, exacto: !!reg.exacto, registro: reg, soloSenave: true };
  }

  /* ---------- región para el GMR (INBIO) ---------- */
  var CHACO = /boqueron|alto paraguay|presidente hayes/, SUR25 = /itapua|caazapa|misiones|guaira|paraguari|neembucu|central|cordillera/, NORTE25 = /san pedro|canindeyu|amambay|concepcion/, LIMITE = /caaguazu|alto parana/;
  function zonaGM(caso) {
    if (!caso) return null;
    var lat = caso.lat != null ? Number(caso.lat) : null, d = norm(caso.departamento), pais = norm(caso.pais || 'paraguay');
    if (pais && pais !== 'paraguay') return null;
    if (CHACO.test(d)) return { chaco: true, texto: 'En el Chaco no hay un rango oficial publicado: se usan materiales importados de GM 7 y 8 para sembrar en diciembre (fuente periodística) y en la red IDEAGRO 2025/26 el ambiente explicó el 82 % de la diferencia de rinde y la variedad solo el 2,5 %.', fuentes: [F.abcChaco, F.ideagro] };
    var sur = lat != null ? lat <= -25 : (SUR25.test(d) ? true : (NORTE25.test(d) ? false : null));
    if (sur === true) return { min: 5.8, max: 6.4, texto: 'al sur del paralelo 25 INBIO recomienda GM 5.8 a 6.4, empezando la siembra con los de ciclo largo y cerrando con los de ciclo corto', fuentes: [F.inbio] };
    var arcilla = caso.suelo && caso.suelo.arcilla != null && caso.suelo.arcilla !== '' ? Number(caso.suelo.arcilla) : null;
    // la guía del norte (6.2 en adelante) INBIO la plantea para suelos más arenosos; en los arcillosos (su región 7) pide variedades de alto rendimiento sin fijar el grupo
    if (sur === false && arcilla != null && arcilla >= 35) return { min: 6.2, max: null, blando: true, texto: 'al norte del paralelo 25 la guía general de INBIO es GM 6.2 en adelante, pensada para suelos más arenosos y siembras desde fines de septiembre; para suelos arcillosos como el tuyo (' + Math.round(arcilla) + ' % de arcilla; región 7 de INBIO: este de Canindeyú, Alto Paraná) recomienda variedades de alto rendimiento sin fijar el grupo', fuentes: [F.inbio] };
    if (sur === false) return { min: 6.2, max: null, texto: 'al norte del paralelo 25 (siembra desde fines de septiembre, más calor y suelos más arenosos) INBIO recomienda variedades rústicas de GM 6.2 en adelante', fuentes: [F.inbio] };
    if (LIMITE.test(d)) return { texto: 'el departamento cruza el paralelo 25: al sur INBIO recomienda GM 5.8 a 6.4 y al norte 6.2 en adelante (cargá las coordenadas del campo para precisarlo)', fuentes: [F.inbio] };
    return null;
  }
  function dentro(z, gm) { if (!z || gm == null || z.min == null) return null; return gm >= z.min && (z.max == null || gm <= z.max); }

  /* ---------- dónde queda el paralelo 25: en palabras y en un mapa ---------- */
  function coord(v) { var n = v == null || v === '' ? NaN : Number(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function ubicacionTexto(caso) {
    var lat = coord(caso && caso.lat), ref = 'esa línea imaginaria cruza Paraguay de oeste a este y pasa apenas al norte de Asunción, Coronel Oviedo y Ciudad del Este';
    if (lat == null) return 'El paralelo 25: ' + ref + '.';
    var km = Math.round(Math.abs(Math.abs(lat) - 25) * 111);   // 1 grado de latitud ≈ 111 km
    return km < 10 ? 'Tu campo está prácticamente sobre el paralelo 25 (' + ref + ').' : 'Tu campo está a unos ' + fmt(km, 0) + ' km al ' + (Math.abs(lat) < 25 ? 'norte' : 'sur') + ' del paralelo 25 (' + ref + ').';
  }
  function botonMapa(caso) {
    var lat = coord(caso && caso.lat), lon = coord(caso && caso.lon);
    return ' <button type="button" class="btn" style="padding:3px 10px;font-size:12px;" data-mapa-zona data-lat="' + (lat == null ? '' : lat) + '" data-lon="' + (lon == null ? '' : lon) + '">Ver en el mapa</button><div class="mapa-zona" style="display:none;height:380px;margin-top:8px;border-radius:10px;overflow:hidden;border:1px solid #E1E4E7;"></div>';
  }
  var LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  function cargarLeaflet() {
    if (window.L && window.L.map) return Promise.resolve();
    return new Promise(function (ok, mal) {
      if (!document.querySelector('link[href="' + LEAFLET_CSS + '"]')) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = LEAFLET_CSS; document.head.appendChild(l); }
      var s = document.createElement('script'); s.src = LEAFLET_JS; s.onload = ok; s.onerror = mal; document.head.appendChild(s);
    });
  }
  function etiquetaMapa(L, mapa, latlng, html, color) {
    return L.marker(latlng, { interactive: false, icon: L.divIcon({ className: '', iconSize: null, html: '<div style="background:rgba(255,255,255,.92);border-left:4px solid ' + color + ';border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.3);padding:4px 8px;font:600 11.5px/1.35 system-ui,sans-serif;color:#1B1F23;white-space:nowrap;">' + html + '</div>' }) }).addTo(mapa);
  }
  function dibujarMapa(div, lat, lon) {
    var L = window.L, mapa = L.map(div, { scrollWheelZoom: false, zoomSnap: 0.25 }).fitBounds([[-27.5, -62.5], [-19.4, -54.3]], { padding: [6, 6] });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12, attribution: '© OpenStreetMap' }).addTo(mapa);
    L.polyline([[-25, -63.5], [-25, -53.5]], { color: '#C0392B', weight: 3, dashArray: '10 7' }).addTo(mapa);
    etiquetaMapa(L, mapa, [-25.08, -61.9], 'Paralelo 25 Sur', '#C0392B');
    etiquetaMapa(L, mapa, [-22.6, -58.4], 'Norte del paralelo 25 (Región Oriental)<br><span style="font-weight:500;">INBIO: GM 6.2 en adelante en suelos arenosos;<br>en suelos arcillosos, variedades de alto rendimiento</span>', '#B8731A');
    etiquetaMapa(L, mapa, [-26.1, -58.1], 'Sur del paralelo 25<br><span style="font-weight:500;">INBIO: GM 5.8 a 6.4</span>', '#178029');
    etiquetaMapa(L, mapa, [-20.6, -61.6], 'Chaco<br><span style="font-weight:500;">sin guía oficial publicada</span>', '#5B6167');
    if (lat != null && lon != null) L.marker([lat, lon]).addTo(mapa).bindTooltip('Tu campo', { permanent: true, direction: 'right' });
    return mapa;
  }
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-mapa-zona]') : null; if (!b) return;
    var div = b.nextElementSibling; if (!div) return;
    if (div.style.display === 'none') {
      div.style.display = 'block'; b.textContent = 'Ocultar el mapa';
      if (div._mapa) { div._mapa.invalidateSize(); return; }
      div.innerHTML = '<div class="muted" style="padding:14px;">Cargando el mapa…</div>';
      cargarLeaflet().then(function () { div.innerHTML = ''; div._mapa = dibujarMapa(div, coord(b.getAttribute('data-lat')), coord(b.getAttribute('data-lon'))); })
        .catch(function () { div.innerHTML = '<div class="muted" style="padding:14px;">No se pudo cargar el mapa (revisá la conexión).</div>'; });
    } else { div.style.display = 'none'; b.textContent = 'Ver en el mapa'; }
  });

  /* ---------- lectura para la fila "Material" ---------- */
  function linkF(u, t) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(t || 'fuente') + '</a>'; }
  function descSoja(nombre, d) {
    if (!d) return '<b>' + esc(nombre) + '</b>: GM sin dato verificado' + (window.SafiaSenave && window.SafiaSenave.disponible() ? ' y no figura en el registro de SENAVE' : '');
    return '<b>' + esc(nombre) + '</b>: ' + (d.gm != null ? 'GM ' + fmt(d.gm, 1) : 'GM sin dato (' + esc(d.nota) + ')') + (d.habito && !d.soloSenave ? ', ' + d.habito : '') + (d.sanidad ? ', ' + d.sanidad : '') + (d.registro && !d.soloSenave ? ' · ' + esc(window.SafiaSenave.etiqueta(d.registro)) : '') + ' <span class="muted" style="font-size:11px;">(' + linkF(d.url, d.nivel) + ')</span>';
  }
  function descMaiz(nombre, d) {
    if (!d) return '<b>' + esc(nombre) + '</b>: ciclo sin dato verificado' + (window.SafiaSenave && window.SafiaSenave.disponible() ? ' y no figura en el registro de SENAVE' : '');
    var p = [];
    if (d.registro && !d.soloSenave) p.push(window.SafiaSenave.etiqueta(d.registro));
    if (d.ciclo) p.push(d.ciclo + ' (Brasil)');
    if (d.senave) p.push('SENAVE Paraguay: ' + d.senave);
    if (d.gduFlor) p.push(fmt(d.gduFlor, 0) + ' GDU a floración' + (d.gduMad ? ', ' + fmt(d.gduMad, 0) + ' a madurez' : ''));
    if (d.gmBayer) p.push('madurez relativa ' + d.gmBayer + ' (escala Bayer)');
    return '<b>' + esc(nombre) + '</b>: ' + (p.join(' · ') || 'sin ciclo publicado') + ' <span class="muted" style="font-size:11px;">(' + linkF(d.url, d.nivel) + (d.exacto ? '' : ', dato de ' + esc(d.nombre)) + ')</span>';
  }
  // Devuelve { corta, detalle } para la tabla de comparación
  function lectura(mio, ref) {
    if (!mio || !ref) return null;
    var cu = cultivoClave(mio.cultivo), a = mio.variedad || '', b = ref.variedad || '';
    if (!a || !b) return { corta: '<span class="muted">sin dato del material en uno de los dos</span>', detalle: '' };
    var mismo = base(a) === base(b) || (buscar(mio.cultivo, a) && buscar(mio.cultivo, b) && buscar(mio.cultivo, a).nombre === buscar(mio.cultivo, b).nombre);
    if (cu === 'soja') {
      var da = buscar('soja', a), db = buscar('soja', b), z = zonaGM(mio);
      var corta;
      if (mismo) corta = 'mismo material';
      else if (da && db && da.gm != null && db.gm != null) {
        var dif = Math.round((da.gm - db.gm) * 10) / 10;   // tu material menos el del lote elegido (mismo sentido que la columna Diferencia)
        corta = Math.abs(dif) < 0.15 ? 'otro material, mismo ciclo (GM ' + fmt(da.gm, 1) + ')' : 'otro material: el tuyo es de ciclo ' + (dif > 0 ? 'más largo' : 'más corto');
      } else corta = 'otro material';
      var det = mismo ? '' : descSoja(a, da) + '<br>' + descSoja(b, db), zonaHTML = '';
      if (z && !z.chaco) {
        var ia = dentro(z, da && da.gm), ib = dentro(z, db && db.gm);
        var fuera = function (quien, gm) { return z.blando ? '; ' + quien + ' (GM ' + fmt(gm, 1) + ') queda por debajo de esa guía general' : '; <b>' + quien + ' (GM ' + fmt(gm, 1) + ') queda fuera de lo que recomienda INBIO para tu zona</b>'; };
        zonaHTML = esc(z.texto.charAt(0).toUpperCase() + z.texto.slice(1)) + (ia === false ? fuera('tu material', da.gm) : '') + (ib === false && !mismo ? fuera('el del lote elegido', db.gm) : '') + ' <span class="muted" style="font-size:11px;">(' + linkF(z.fuentes[0].url, 'INBIO') + ')</span>.';
      } else if (z && z.chaco) zonaHTML = esc(z.texto);
      if (zonaHTML) det += (det ? '<br>' : '') + 'Para tu zona: ' + zonaHTML;
      // en palabras simples dónde queda el paralelo 25, y el mapa
      if (zonaHTML) zonaHTML = (z.chaco ? '' : esc(ubicacionTexto(mio)) + '<br>') + zonaHTML + botonMapa(mio);
      return { corta: corta, detalle: det, cu: 'soja', mismo: mismo, a: da, b: db, difGM: (da && db && da.gm != null && db.gm != null) ? Math.round((da.gm - db.gm) * 10) / 10 : null, zonaHTML: zonaHTML };
    }
    if (cu === 'maiz') {
      var ma = buscar('maiz', a), mb = buscar('maiz', b);
      var c2 = mismo ? 'mismo material' : ((ma && mb && ma.ciclo && mb.ciclo && ma.ciclo !== mb.ciclo) ? 'otro material, otro ciclo (el tuyo ' + ma.ciclo + ', el elegido ' + mb.ciclo + ')' : 'otro material');
      var otraEmpresa = ma && mb && ma.gduFlor && mb.gduFlor && ma.url.split('/')[2] !== mb.url.split('/')[2];
      return { corta: c2, detalle: mismo ? '' : descMaiz(a, ma) + '<br>' + descMaiz(b, mb) + (otraEmpresa ? '<br><span class="muted">Los grados-día de empresas distintas no se comparan entre sí: cada una los calcula a su manera.</span>' : ''), cu: 'maiz', mismo: mismo, a: ma, b: mb, difGDU: (ma && mb && ma.gduFlor && mb.gduFlor && !otraEmpresa) ? ma.gduFlor - mb.gduFlor : null, otraEmpresa: !!otraEmpresa };
    }
    return { corta: mismo ? 'mismo material' : 'otro material', detalle: '' };
  }
  // Texto corto para listas (ranking): "GM 6.4" o "superprecoz"
  function corto(cultivo, nombre) {
    var d = buscar(cultivo, nombre); if (!d) return '';
    if (cultivoClave(cultivo) === 'soja') return d.gm != null ? 'GM ' + fmt(d.gm, 1) : '';
    return d.ciclo || (d.senave ? d.senave.split(' ')[0] : '');
  }

  /* ---------- ensayos (copia del 28-sep-2026) ---------- */
  var ENSAYOS = {"maiz":[{"loc":"Ponta Porã","estado":"MS (Brasil)","url":"https://storage.googleapis.com/fundacaoms-bucket/media/uploads/b464e9fded614df2891ced67922fc71d-23-09-2026.pdf","siembra":"26/02/2026","lat":-22.618222,"zafra":"Safrinha 2026","fuente":"Fundação MS, Rede de Validação de Híbridos de Milho Safrinha 2026","filas":[{"hibrido":"DKB260PRO4","grupo":"superprecoz","sc":154.6,"kg":9276,"promEnsayoSc":128.5,"dif":20.3},{"hibrido":"P30053PWU","grupo":"superprecoz","sc":149.7,"kg":8982,"promEnsayoSc":128.5,"dif":16.5},{"hibrido":"FS470PWU","grupo":"superprecoz","sc":144.9,"kg":8694,"promEnsayoSc":128.5,"dif":12.8},{"hibrido":"NK401VIP3","grupo":"superprecoz","sc":142.9,"kg":8574,"promEnsayoSc":128.5,"dif":11.2},{"hibrido":"K9200VIP3","grupo":"superprecoz","sc":139.5,"kg":8370,"promEnsayoSc":128.5,"dif":8.6},{"hibrido":"AG9035PRO4","grupo":"superprecoz","sc":137.8,"kg":8268,"promEnsayoSc":128.5,"dif":7.2},{"hibrido":"SHS7957VIP3","grupo":"superprecoz","sc":135.9,"kg":8154,"promEnsayoSc":128.5,"dif":5.8},{"hibrido":"P3322PWU","grupo":"superprecoz","sc":134.5,"kg":8070,"promEnsayoSc":128.5,"dif":4.7},{"hibrido":"AGN2M30PRO4","grupo":"superprecoz","sc":133.9,"kg":8034,"promEnsayoSc":128.5,"dif":4.2},{"hibrido":"S5068","grupo":"superprecoz","sc":132.9,"kg":7974,"promEnsayoSc":128.5,"dif":3.4},{"hibrido":"VELOCITA","grupo":"superprecoz","sc":126,"kg":7560,"promEnsayoSc":128.5,"dif":-1.9},{"hibrido":"ST9504VIP3","grupo":"superprecoz","sc":123,"kg":7380,"promEnsayoSc":128.5,"dif":-4.3},{"hibrido":"1033F335-48","grupo":"superprecoz","sc":121.6,"kg":7296,"promEnsayoSc":128.5,"dif":-5.4},{"hibrido":"NS44VIP3","grupo":"superprecoz","sc":119.3,"kg":7158,"promEnsayoSc":128.5,"dif":-7.2},{"hibrido":"AGN2M55PRO4","grupo":"superprecoz","sc":116.5,"kg":6990,"promEnsayoSc":128.5,"dif":-9.3},{"hibrido":"CRWX06","grupo":"superprecoz","sc":100.8,"kg":6048,"promEnsayoSc":128.5,"dif":-21.6},{"hibrido":"CRWX03","grupo":"superprecoz","sc":100.4,"kg":6024,"promEnsayoSc":128.5,"dif":-21.9},{"hibrido":"CRWX05","grupo":"superprecoz","sc":98.3,"kg":5898,"promEnsayoSc":128.5,"dif":-23.5},{"hibrido":"MG586PWU","grupo":"precoz","sc":154,"kg":9240,"promEnsayoSc":136.6,"dif":12.7},{"hibrido":"K9575VIP3","grupo":"precoz","sc":153.1,"kg":9186,"promEnsayoSc":136.6,"dif":12.1},{"hibrido":"MG540PWU","grupo":"precoz","sc":152,"kg":9120,"promEnsayoSc":136.6,"dif":11.3},{"hibrido":"NK501PWU","grupo":"precoz","sc":149.7,"kg":8982,"promEnsayoSc":136.6,"dif":9.6},{"hibrido":"DKB255PRO4","grupo":"precoz","sc":147,"kg":8820,"promEnsayoSc":136.6,"dif":7.6},{"hibrido":"ST9801VIP3","grupo":"precoz","sc":144.9,"kg":8694,"promEnsayoSc":136.6,"dif":6.1},{"hibrido":"AS1877PRO4","grupo":"precoz","sc":144.2,"kg":8652,"promEnsayoSc":136.6,"dif":5.6},{"hibrido":"LG36680PRO4","grupo":"precoz","sc":143.9,"kg":8634,"promEnsayoSc":136.6,"dif":5.3},{"hibrido":"FS650PWU","grupo":"precoz","sc":143,"kg":8580,"promEnsayoSc":136.6,"dif":4.7},{"hibrido":"LG36745PRO4","grupo":"precoz","sc":142.8,"kg":8568,"promEnsayoSc":136.6,"dif":4.5},{"hibrido":"LG36677VIP3","grupo":"precoz","sc":142.7,"kg":8562,"promEnsayoSc":136.6,"dif":4.5},{"hibrido":"AG8701PRO4","grupo":"precoz","sc":142.1,"kg":8526,"promEnsayoSc":136.6,"dif":4},{"hibrido":"MG676VIP3","grupo":"precoz","sc":141.9,"kg":8514,"promEnsayoSc":136.6,"dif":3.9},{"hibrido":"LG36755PRO4","grupo":"precoz","sc":141.8,"kg":8508,"promEnsayoSc":136.6,"dif":3.8},{"hibrido":"NS71VIP3","grupo":"precoz","sc":141.7,"kg":8502,"promEnsayoSc":136.6,"dif":3.7},{"hibrido":"CODAGROMENPRO4","grupo":"precoz","sc":141.4,"kg":8484,"promEnsayoSc":136.6,"dif":3.5},{"hibrido":"P35200PWU","grupo":"precoz","sc":141.2,"kg":8472,"promEnsayoSc":136.6,"dif":3.4},{"hibrido":"ST9717VIP3","grupo":"precoz","sc":140.9,"kg":8454,"promEnsayoSc":136.6,"dif":3.1},{"hibrido":"T1508PWU","grupo":"precoz","sc":140.4,"kg":8424,"promEnsayoSc":136.6,"dif":2.8},{"hibrido":"FS695PWU","grupo":"precoz","sc":140.3,"kg":8418,"promEnsayoSc":136.6,"dif":2.7},{"hibrido":"AS1991PRO4","grupo":"precoz","sc":138.8,"kg":8328,"promEnsayoSc":136.6,"dif":1.6},{"hibrido":"ST9808PRO4","grupo":"precoz","sc":137.7,"kg":8262,"promEnsayoSc":136.6,"dif":0.8},{"hibrido":"GNZ7763VIP3","grupo":"precoz","sc":135.9,"kg":8154,"promEnsayoSc":136.6,"dif":-0.5},{"hibrido":"1037F490-48","grupo":"precoz","sc":135.7,"kg":8142,"promEnsayoSc":136.6,"dif":-0.7},{"hibrido":"FS700PWU","grupo":"precoz","sc":134.8,"kg":8088,"promEnsayoSc":136.6,"dif":-1.3},{"hibrido":"K7575VIP3","grupo":"precoz","sc":134.7,"kg":8082,"promEnsayoSc":136.6,"dif":-1.4},{"hibrido":"DM2858VIP3","grupo":"precoz","sc":134.4,"kg":8064,"promEnsayoSc":136.6,"dif":-1.6},{"hibrido":"NS66VIP3","grupo":"precoz","sc":132.3,"kg":7938,"promEnsayoSc":136.6,"dif":-3.1},{"hibrido":"MU23-2296K","grupo":"precoz","sc":131.5,"kg":7890,"promEnsayoSc":136.6,"dif":-3.7},{"hibrido":"NK490VIP3","grupo":"precoz","sc":130.9,"kg":7854,"promEnsayoSc":136.6,"dif":-4.2},{"hibrido":"SHS2070","grupo":"precoz","sc":130.3,"kg":7818,"promEnsayoSc":136.6,"dif":-4.6},{"hibrido":"1037D486-48","grupo":"precoz","sc":129.7,"kg":7782,"promEnsayoSc":136.6,"dif":-5.1},{"hibrido":"MU23-2295K","grupo":"precoz","sc":126.1,"kg":7566,"promEnsayoSc":136.6,"dif":-7.7},{"hibrido":"GDM10077VIP3","grupo":"precoz","sc":125.7,"kg":7542,"promEnsayoSc":136.6,"dif":-8},{"hibrido":"P3845VYHR","grupo":"precoz","sc":124.3,"kg":7458,"promEnsayoSc":136.6,"dif":-9},{"hibrido":"NK507VIP3","grupo":"precoz","sc":122.6,"kg":7356,"promEnsayoSc":136.6,"dif":-10.2},{"hibrido":"GNZ7757VIP3","grupo":"precoz","sc":114.3,"kg":6858,"promEnsayoSc":136.6,"dif":-16.3},{"hibrido":"GNZ7774VIP3","grupo":"precoz","sc":110.5,"kg":6630,"promEnsayoSc":136.6,"dif":-19.1},{"hibrido":"ST9505PRO4","grupo":"precoz","sc":108.7,"kg":6522,"promEnsayoSc":136.6,"dif":-20.4}],"promedios":{"superprecoz":128.5,"precoz":136.6}},{"loc":"Rio Brilhante","estado":"MS (Brasil)","url":"https://storage.googleapis.com/fundacaoms-bucket/media/uploads/734cc4abe952493faee325c258dfe597-23-09-2026.pdf","siembra":"07/03/2026","lat":-21.848654,"zafra":"Safrinha 2026","fuente":"Fundação MS, Rede de Validação de Híbridos de Milho Safrinha 2026","filas":[{"hibrido":"AGN2M55PRO4","grupo":"superprecoz","sc":139.9,"kg":8394,"promEnsayoSc":126.1,"dif":10.9},{"hibrido":"FS470PWU","grupo":"superprecoz","sc":138.2,"kg":8292,"promEnsayoSc":126.1,"dif":9.6},{"hibrido":"P30053PWU","grupo":"superprecoz","sc":138,"kg":8280,"promEnsayoSc":126.1,"dif":9.4},{"hibrido":"ST9504VIP3","grupo":"superprecoz","sc":136.8,"kg":8208,"promEnsayoSc":126.1,"dif":8.5},{"hibrido":"AGN2M30PRO4","grupo":"superprecoz","sc":134.4,"kg":8064,"promEnsayoSc":126.1,"dif":6.6},{"hibrido":"K9200VIP3","grupo":"superprecoz","sc":133,"kg":7980,"promEnsayoSc":126.1,"dif":5.5},{"hibrido":"SHS7595VIP3","grupo":"superprecoz","sc":132.4,"kg":7944,"promEnsayoSc":126.1,"dif":5},{"hibrido":"DKB260PRO4","grupo":"superprecoz","sc":129,"kg":7740,"promEnsayoSc":126.1,"dif":2.3},{"hibrido":"NK401VIP3","grupo":"superprecoz","sc":128.6,"kg":7716,"promEnsayoSc":126.1,"dif":2},{"hibrido":"S5068","grupo":"superprecoz","sc":128.1,"kg":7686,"promEnsayoSc":126.1,"dif":1.6},{"hibrido":"AG9035PRO4","grupo":"superprecoz","sc":127,"kg":7620,"promEnsayoSc":126.1,"dif":0.7},{"hibrido":"NS44VIP3","grupo":"superprecoz","sc":126.3,"kg":7578,"promEnsayoSc":126.1,"dif":0.2},{"hibrido":"1033F335-48","grupo":"superprecoz","sc":125.4,"kg":7524,"promEnsayoSc":126.1,"dif":-0.6},{"hibrido":"P3322PWU","grupo":"superprecoz","sc":119.2,"kg":7152,"promEnsayoSc":126.1,"dif":-5.5},{"hibrido":"CRWX05","grupo":"superprecoz","sc":110,"kg":6600,"promEnsayoSc":126.1,"dif":-12.8},{"hibrido":"CRWX06","grupo":"superprecoz","sc":98.9,"kg":5934,"promEnsayoSc":126.1,"dif":-21.6},{"hibrido":"CRWX03","grupo":"superprecoz","sc":98.1,"kg":5886,"promEnsayoSc":126.1,"dif":-22.2},{"hibrido":"CODAGROMENPRO4","grupo":"precoz","sc":147,"kg":8820,"promEnsayoSc":129.8,"dif":13.3},{"hibrido":"GDM10077VIP3","grupo":"precoz","sc":145.3,"kg":8718,"promEnsayoSc":129.8,"dif":11.9},{"hibrido":"FS700PWU","grupo":"precoz","sc":141.8,"kg":8508,"promEnsayoSc":129.8,"dif":9.2},{"hibrido":"ST9505PRO4","grupo":"precoz","sc":139.5,"kg":8370,"promEnsayoSc":129.8,"dif":7.5},{"hibrido":"ST9808PRO4","grupo":"precoz","sc":138.9,"kg":8334,"promEnsayoSc":129.8,"dif":7},{"hibrido":"MG540PWU","grupo":"precoz","sc":138.6,"kg":8316,"promEnsayoSc":129.8,"dif":6.8},{"hibrido":"K9575VIP3","grupo":"precoz","sc":138.5,"kg":8310,"promEnsayoSc":129.8,"dif":6.7},{"hibrido":"K7575VIP3","grupo":"precoz","sc":136.8,"kg":8208,"promEnsayoSc":129.8,"dif":5.4},{"hibrido":"AG8701PRO4","grupo":"precoz","sc":135.8,"kg":8148,"promEnsayoSc":129.8,"dif":4.6},{"hibrido":"K7510VIP3","grupo":"precoz","sc":135.5,"kg":8130,"promEnsayoSc":129.8,"dif":4.4},{"hibrido":"NK507VIP3","grupo":"precoz","sc":135,"kg":8100,"promEnsayoSc":129.8,"dif":4},{"hibrido":"P35200PWU","grupo":"precoz","sc":133.8,"kg":8028,"promEnsayoSc":129.8,"dif":3.1},{"hibrido":"NK501VIP4","grupo":"precoz","sc":131.9,"kg":7914,"promEnsayoSc":129.8,"dif":1.6},{"hibrido":"GNZ7757VIP3","grupo":"precoz","sc":131.7,"kg":7902,"promEnsayoSc":129.8,"dif":1.5},{"hibrido":"FS650PWU","grupo":"precoz","sc":131.3,"kg":7878,"promEnsayoSc":129.8,"dif":1.2},{"hibrido":"T1508PWU","grupo":"precoz","sc":130.3,"kg":7818,"promEnsayoSc":129.8,"dif":0.4},{"hibrido":"GDMX0009VIP3","grupo":"precoz","sc":130.1,"kg":7806,"promEnsayoSc":129.8,"dif":0.2},{"hibrido":"GDMX0001VIP3","grupo":"precoz","sc":129.7,"kg":7782,"promEnsayoSc":129.8,"dif":-0.1},{"hibrido":"GDMX0008VIP3","grupo":"precoz","sc":129.4,"kg":7764,"promEnsayoSc":129.8,"dif":-0.3},{"hibrido":"DKB255PRO4","grupo":"precoz","sc":129.4,"kg":7764,"promEnsayoSc":129.8,"dif":-0.3},{"hibrido":"NS66VIP3","grupo":"precoz","sc":129.3,"kg":7758,"promEnsayoSc":129.8,"dif":-0.4},{"hibrido":"ST9717VIP3","grupo":"precoz","sc":129.2,"kg":7752,"promEnsayoSc":129.8,"dif":-0.5},{"hibrido":"MU23-2296K","grupo":"precoz","sc":127.5,"kg":7650,"promEnsayoSc":129.8,"dif":-1.8},{"hibrido":"P3845VYHR","grupo":"precoz","sc":126.8,"kg":7608,"promEnsayoSc":129.8,"dif":-2.3},{"hibrido":"GNZ7744VIP3","grupo":"precoz","sc":126.6,"kg":7596,"promEnsayoSc":129.8,"dif":-2.5},{"hibrido":"ST9801VIP3","grupo":"precoz","sc":125.9,"kg":7554,"promEnsayoSc":129.8,"dif":-3},{"hibrido":"NK490VIP3","grupo":"precoz","sc":125.9,"kg":7554,"promEnsayoSc":129.8,"dif":-3},{"hibrido":"FS695PWU","grupo":"precoz","sc":125.5,"kg":7530,"promEnsayoSc":129.8,"dif":-3.3},{"hibrido":"SHS2070","grupo":"precoz","sc":124.2,"kg":7452,"promEnsayoSc":129.8,"dif":-4.3},{"hibrido":"AS1991PRO4","grupo":"precoz","sc":123.7,"kg":7422,"promEnsayoSc":129.8,"dif":-4.7},{"hibrido":"NS71VIP3","grupo":"precoz","sc":123.6,"kg":7416,"promEnsayoSc":129.8,"dif":-4.8},{"hibrido":"MU23-2295K","grupo":"precoz","sc":122.5,"kg":7350,"promEnsayoSc":129.8,"dif":-5.6},{"hibrido":"FORT","grupo":"precoz","sc":112.5,"kg":6750,"promEnsayoSc":129.8,"dif":-13.3},{"hibrido":"1037D486-48","grupo":"precoz","sc":105.1,"kg":6306,"promEnsayoSc":129.8,"dif":-19},{"hibrido":"MG586PWU","grupo":"precoz","sc":104,"kg":6240,"promEnsayoSc":129.8,"dif":-19.9}],"promedios":{"superprecoz":126.1,"precoz":129.8}},{"loc":"Anaurilândia","estado":"MS (Brasil)","url":"https://storage.googleapis.com/fundacaoms-bucket/media/uploads/6aacec39088a49838e68374e5904a0ea-23-09-2026.pdf","siembra":"26/02/2026","lat":-22.137458,"zafra":"Safrinha 2026","fuente":"Fundação MS, Rede de Validação de Híbridos de Milho Safrinha 2026","filas":[{"hibrido":"1033F335-48","grupo":"superprecoz","sc":132,"kg":7920,"promEnsayoSc":105.2,"dif":25.5},{"hibrido":"P30053PWU","grupo":"superprecoz","sc":129.5,"kg":7770,"promEnsayoSc":105.2,"dif":23.1},{"hibrido":"P3322PWU","grupo":"superprecoz","sc":121.6,"kg":7296,"promEnsayoSc":105.2,"dif":15.6},{"hibrido":"NS44VIP3","grupo":"superprecoz","sc":120.8,"kg":7248,"promEnsayoSc":105.2,"dif":14.8},{"hibrido":"FS470PWU","grupo":"superprecoz","sc":103.8,"kg":6228,"promEnsayoSc":105.2,"dif":-1.3},{"hibrido":"CRWX06","grupo":"superprecoz","sc":82.4,"kg":4944,"promEnsayoSc":105.2,"dif":-21.7},{"hibrido":"CRWX05","grupo":"superprecoz","sc":80.6,"kg":4836,"promEnsayoSc":105.2,"dif":-23.4},{"hibrido":"CRWX03","grupo":"superprecoz","sc":70.6,"kg":4236,"promEnsayoSc":105.2,"dif":-32.9},{"hibrido":"GDMX0009VIP3","grupo":"precoz","sc":142.2,"kg":8532,"promEnsayoSc":121.9,"dif":16.7},{"hibrido":"K9575VIP3","grupo":"precoz","sc":136.4,"kg":8184,"promEnsayoSc":121.9,"dif":11.9},{"hibrido":"P35200PWU","grupo":"precoz","sc":135.3,"kg":8118,"promEnsayoSc":121.9,"dif":11},{"hibrido":"NS66VIP3","grupo":"precoz","sc":134.7,"kg":8082,"promEnsayoSc":121.9,"dif":10.5},{"hibrido":"FS650PWU","grupo":"precoz","sc":134.5,"kg":8070,"promEnsayoSc":121.9,"dif":10.3},{"hibrido":"NS71VIP3","grupo":"precoz","sc":132.4,"kg":7944,"promEnsayoSc":121.9,"dif":8.6},{"hibrido":"MG586PWU","grupo":"precoz","sc":131.6,"kg":7896,"promEnsayoSc":121.9,"dif":8},{"hibrido":"GDM10077VIP3","grupo":"precoz","sc":130.1,"kg":7806,"promEnsayoSc":121.9,"dif":6.7},{"hibrido":"MU23-2296K","grupo":"precoz","sc":126.9,"kg":7614,"promEnsayoSc":121.9,"dif":4.1},{"hibrido":"MU23-2295K","grupo":"precoz","sc":126,"kg":7560,"promEnsayoSc":121.9,"dif":3.4},{"hibrido":"K7510VIP3","grupo":"precoz","sc":125.1,"kg":7506,"promEnsayoSc":121.9,"dif":2.6},{"hibrido":"MG676VIP3","grupo":"precoz","sc":124,"kg":7440,"promEnsayoSc":121.9,"dif":1.7},{"hibrido":"FS695PWU","grupo":"precoz","sc":123.3,"kg":7398,"promEnsayoSc":121.9,"dif":1.1},{"hibrido":"MG540PWU","grupo":"precoz","sc":123,"kg":7380,"promEnsayoSc":121.9,"dif":0.9},{"hibrido":"T1508PWU","grupo":"precoz","sc":116.7,"kg":7002,"promEnsayoSc":121.9,"dif":-4.3},{"hibrido":"GDMX0001VIP3","grupo":"precoz","sc":116.4,"kg":6984,"promEnsayoSc":121.9,"dif":-4.5},{"hibrido":"P3845VYHR","grupo":"precoz","sc":114.8,"kg":6888,"promEnsayoSc":121.9,"dif":-5.8},{"hibrido":"GDMX0008VIP3","grupo":"precoz","sc":114.7,"kg":6882,"promEnsayoSc":121.9,"dif":-5.9},{"hibrido":"NK490VIP3","grupo":"precoz","sc":114.2,"kg":6852,"promEnsayoSc":121.9,"dif":-6.3},{"hibrido":"NK501VIP3","grupo":"precoz","sc":113.5,"kg":6810,"promEnsayoSc":121.9,"dif":-6.9},{"hibrido":"DM2858VIP3","grupo":"precoz","sc":108.4,"kg":6504,"promEnsayoSc":121.9,"dif":-11.1},{"hibrido":"1037D486-48","grupo":"precoz","sc":98.9,"kg":5934,"promEnsayoSc":121.9,"dif":-18.9},{"hibrido":"K7575VIP3","grupo":"precoz","sc":80.8,"kg":4848,"promEnsayoSc":121.9,"dif":-33.7}],"promedios":{"superprecoz":105.2,"precoz":121.9}}],"soja":[{"loc":"Capitán Miranda","departamento":"Itapúa","fuente":"IPTA, Informe online de las variedades comerciales de soja del Paraguay (Abbate, Lázaro, Urunaga; datos hasta la zafra 2024)","url":"https://cultivaresparaguayos.com/soja/","siembra":{"Intermedio":"12-nov","Semiprecoz":"09-nov","Precoz":"07-nov"},"filas":[{"cultivar":"DM 67I70","criadero":"DON MARIO","ciclo":"Intermedio","kg":1668,"dif":3.4,"anio":2024,"kg2":null,"dif2":null,"anios2":null},{"cultivar":"NS 6248","criadero":"NIDERA (SYNGENTA)","ciclo":"Intermedio","kg":1649,"dif":2.2,"anio":2024,"kg2":1993,"dif2":-5.3,"anios2":[2024,2023]},{"cultivar":"NS 6483 RR","criadero":"NIDERA (SYNGENTA)","ciclo":"Intermedio","kg":1525,"dif":-5.5,"anio":2024,"kg2":2214,"dif2":5.3,"anios2":[2024,2023]},{"cultivar":"M-6410 IPRO","criadero":"MAGUAR","ciclo":"Semiprecoz","kg":2824,"dif":20.7,"anio":2024,"kg2":2590,"dif2":19.1,"anios2":[2024,2023]},{"cultivar":"SOJAPAR R24","criadero":"SOJAPAR","ciclo":"Semiprecoz","kg":2245,"dif":-4,"anio":2024,"kg2":1887,"dif2":-13.2,"anios2":[2024,2023]},{"cultivar":"SOJAPAR R19","criadero":"SOJAPAR","ciclo":"Semiprecoz","kg":2229,"dif":-4.7,"anio":2024,"kg2":2300,"dif2":5.8,"anios2":[2024,2023]},{"cultivar":"DM 62R63 RSF","criadero":"DON MARIO","ciclo":"Semiprecoz","kg":2059,"dif":-12,"anio":2024,"kg2":1923,"dif2":-11.6,"anios2":[2024,2023]},{"cultivar":"63I64 RSF IPRO","criadero":"NIDERA (SYNGENTA)","ciclo":"Precoz","kg":2846,"dif":16.1,"anio":2024,"kg2":2795,"dif2":19.5,"anios2":[2024,2023]},{"cultivar":"AG 5909 RG","criadero":"ASGROW (BAYER)","ciclo":"Precoz","kg":2488,"dif":1.5,"anio":2024,"kg2":2019,"dif2":-13.7,"anios2":[2024,2023]},{"cultivar":"NS 6012 RSF IPRO","criadero":"NIDERA (SYNGENTA)","ciclo":"Precoz","kg":2019,"dif":-17.6,"anio":2024,"kg2":2202,"dif2":-5.8,"anios2":[2024,2023]}]},{"loc":"Tomás Romero Pereira","departamento":"Itapúa","fuente":"IPTA, Informe online de las variedades comerciales de soja del Paraguay (Abbate, Lázaro, Urunaga; datos hasta la zafra 2024)","url":"https://cultivaresparaguayos.com/soja/","siembra":{"Intermedio":"n/d","Semiprecoz":"n/d","Precoz":"n/d"},"filas":[{"cultivar":"NS 6248","criadero":"NIDERA (SYNGENTA)","ciclo":"Intermedio","kg":3225,"dif":5.5,"anio":2023,"kg2":null,"dif2":null,"anios2":null},{"cultivar":"NS 6483 RR","criadero":"NIDERA (SYNGENTA)","ciclo":"Intermedio","kg":3165,"dif":3.5,"anio":2023,"kg2":null,"dif2":null,"anios2":null},{"cultivar":"NS 7209 IPRO","criadero":"NIDERA (SYNGENTA)","ciclo":"Intermedio","kg":2782,"dif":-9,"anio":2023,"kg2":null,"dif2":null,"anios2":null},{"cultivar":"SOJAPAR R19","criadero":"SOJAPAR","ciclo":"Semiprecoz","kg":4108,"dif":19.4,"anio":2023,"kg2":null,"dif2":null,"anios2":null},{"cultivar":"DM 62R63 RSF","criadero":"DON MARIO","ciclo":"Semiprecoz","kg":3573,"dif":3.9,"anio":2023,"kg2":null,"dif2":null,"anios2":null},{"cultivar":"M-6410 IPRO","criadero":"MAGUAR","ciclo":"Semiprecoz","kg":3326,"dif":-3.3,"anio":2023,"kg2":null,"dif2":null,"anios2":null},{"cultivar":"SOJAPAR R24","criadero":"SOJAPAR","ciclo":"Semiprecoz","kg":2752,"dif":-20,"anio":2023,"kg2":null,"dif2":null,"anios2":null}]},{"loc":"Campo 9","departamento":"Caaguazú","fuente":"IPTA, Informe online de las variedades comerciales de soja del Paraguay (Abbate, Lázaro, Urunaga; datos hasta la zafra 2024)","url":"https://cultivaresparaguayos.com/soja/","siembra":{"Intermedio":"31-oct","Semiprecoz":"05-nov","Precoz":"01-nov"},"filas":[{"cultivar":"NS 6248","criadero":"NIDERA (SYNGENTA)","ciclo":"Intermedio","kg":1869,"dif":5.7,"anio":2024,"kg2":2823,"dif2":2.2,"anios2":[2024,2022]},{"cultivar":"DM 67I70","criadero":"DON MARIO","ciclo":"Intermedio","kg":1833,"dif":3.7,"anio":2024,"kg2":null,"dif2":null,"anios2":null},{"cultivar":"NS 6483 RR","criadero":"NIDERA (SYNGENTA)","ciclo":"Intermedio","kg":1603,"dif":-9.4,"anio":2024,"kg2":2703,"dif2":-2.2,"anios2":[2024,2022]},{"cultivar":"SOJAPAR R24","criadero":"SOJAPAR","ciclo":"Semiprecoz","kg":1933,"dif":3.7,"anio":2024,"kg2":2447,"dif2":-4.1,"anios2":[2024,2022]},{"cultivar":"DM 62R63 RSF","criadero":"DON MARIO","ciclo":"Semiprecoz","kg":1909,"dif":2.4,"anio":2024,"kg2":2715,"dif2":6.4,"anios2":[2024,2022]},{"cultivar":"SOJAPAR R19","criadero":"SOJAPAR","ciclo":"Semiprecoz","kg":1681,"dif":-9.8,"anio":2024,"kg2":2600,"dif2":1.9,"anios2":[2024,2022]},{"cultivar":"63I64 RSF IPRO","criadero":"NIDERA (SYNGENTA)","ciclo":"Precoz","kg":3956,"dif":11.5,"anio":2023,"kg2":3936,"dif2":12.9,"anios2":[2023,2022]},{"cultivar":"NS 6012 RSF IPRO","criadero":"NIDERA (SYNGENTA)","ciclo":"Precoz","kg":3558,"dif":0.2,"anio":2023,"kg2":3505,"dif2":0.5,"anios2":[2023,2022]},{"cultivar":"AG 5909 RG","criadero":"ASGROW (BAYER)","ciclo":"Precoz","kg":3135,"dif":-11.7,"anio":2023,"kg2":3019,"dif2":-13.4,"anios2":[2023,2022]}]},{"loc":"Yguazú","departamento":"Alto Paraná","fuente":"IPTA, Informe online de las variedades comerciales de soja del Paraguay (Abbate, Lázaro, Urunaga; datos hasta la zafra 2024)","url":"https://cultivaresparaguayos.com/soja/","siembra":{"Intermedio":"15-oct","Semiprecoz":"23-oct","Precoz":"23-oct"},"filas":[{"cultivar":"NS 6248","criadero":"NIDERA (SYNGENTA)","ciclo":"Intermedio","kg":3408,"dif":12.2,"anio":2023,"kg2":2980,"dif2":0.6,"anios2":[2023,2022]},{"cultivar":"NS 6483 RR","criadero":"NIDERA (SYNGENTA)","ciclo":"Intermedio","kg":2873,"dif":-5.4,"anio":2023,"kg2":2840,"dif2":-4.1,"anios2":[2023,2022]},{"cultivar":"NS 7209 IPRO","criadero":"NIDERA (SYNGENTA)","ciclo":"Intermedio","kg":2830,"dif":-6.8,"anio":2023,"kg2":3060,"dif2":3.5,"anios2":[2023,2022]},{"cultivar":"DM 62R63 RSF","criadero":"DON MARIO","ciclo":"Semiprecoz","kg":3975,"dif":11.8,"anio":2023,"kg2":3312,"dif2":4.9,"anios2":[2023,2022]},{"cultivar":"SOJAPAR R19","criadero":"SOJAPAR","ciclo":"Semiprecoz","kg":3617,"dif":1.7,"anio":2023,"kg2":3191,"dif2":1.1,"anios2":[2023,2022]},{"cultivar":"M-6410 IPRO","criadero":"MAGUAR","ciclo":"Semiprecoz","kg":3511,"dif":-1.3,"anio":2023,"kg2":3285,"dif2":4.1,"anios2":[2023,2022]},{"cultivar":"SOJAPAR R24","criadero":"SOJAPAR","ciclo":"Semiprecoz","kg":3121,"dif":-12.2,"anio":2023,"kg2":2840,"dif2":-10,"anios2":[2023,2022]},{"cultivar":"63I64 RSF IPRO","criadero":"NIDERA (SYNGENTA)","ciclo":"Precoz","kg":3707,"dif":-4.4,"anio":2023,"kg2":3430,"dif2":0.4,"anios2":[2023,2022]},{"cultivar":"NS 6012 RSF IPRO","criadero":"NIDERA (SYNGENTA)","ciclo":"Precoz","kg":3925,"dif":1.2,"anio":2023,"kg2":3495,"dif2":2.3,"anios2":[2023,2022]},{"cultivar":"AG 5909 RG","criadero":"ASGROW (BAYER)","ciclo":"Precoz","kg":4006,"dif":3.3,"anio":2023,"kg2":3325,"dif2":-2.7,"anios2":[2023,2022]}]},{"loc":"Yhovy","departamento":"Canindeyú","fuente":"IPTA, Informe online de las variedades comerciales de soja del Paraguay (Abbate, Lázaro, Urunaga; datos hasta la zafra 2024)","url":"https://cultivaresparaguayos.com/soja/","siembra":{"Intermedio":"30-oct","Semiprecoz":"01-nov","Precoz":"30-oct"},"filas":[{"cultivar":"NS 6248","criadero":"NIDERA (SYNGENTA)","ciclo":"Intermedio","kg":2330,"dif":2.8,"anio":2024,"kg2":2990,"dif2":8.1,"anios2":[2024,2023]},{"cultivar":"DM 67I70","criadero":"DON MARIO","ciclo":"Intermedio","kg":2296,"dif":1.3,"anio":2024,"kg2":null,"dif2":null,"anios2":null},{"cultivar":"NS 6483 RR","criadero":"NIDERA (SYNGENTA)","ciclo":"Intermedio","kg":2175,"dif":-4.1,"anio":2024,"kg2":2540,"dif2":-8.1,"anios2":[2024,2023]},{"cultivar":"SOJAPAR R19","criadero":"SOJAPAR","ciclo":"Semiprecoz","kg":2359,"dif":5.7,"anio":2024,"kg2":2516,"dif2":-2.2,"anios2":[2024,2023]},{"cultivar":"M-6410 IPRO","criadero":"MAGUAR","ciclo":"Semiprecoz","kg":2253,"dif":0.9,"anio":2024,"kg2":2934,"dif2":14.1,"anios2":[2024,2023]},{"cultivar":"SOJAPAR R24","criadero":"SOJAPAR","ciclo":"Semiprecoz","kg":2250,"dif":0.8,"anio":2024,"kg2":2187,"dif2":-15,"anios2":[2024,2023]},{"cultivar":"DM 62R63 RSF","criadero":"DON MARIO","ciclo":"Semiprecoz","kg":2067,"dif":-7.4,"anio":2024,"kg2":2651,"dif2":3.1,"anios2":[2024,2023]},{"cultivar":"63I64 RSF IPRO","criadero":"NIDERA (SYNGENTA)","ciclo":"Precoz","kg":2775,"dif":13,"anio":2024,"kg2":2964,"dif2":8.2,"anios2":[2024,2023]},{"cultivar":"NS 6012 RSF IPRO","criadero":"NIDERA (SYNGENTA)","ciclo":"Precoz","kg":2397,"dif":-2.4,"anio":2024,"kg2":2717,"dif2":-0.8,"anios2":[2024,2023]},{"cultivar":"AG 5909 RG","criadero":"ASGROW (BAYER)","ciclo":"Precoz","kg":2198,"dif":-10.5,"anio":2024,"kg2":2538,"dif2":-7.3,"anios2":[2024,2023]}]},{"loc":"Choré","departamento":"San Pedro","fuente":"IPTA, Informe online de las variedades comerciales de soja del Paraguay (Abbate, Lázaro, Urunaga; datos hasta la zafra 2024)","url":"https://cultivaresparaguayos.com/soja/","siembra":{"Intermedio":"n/d","Semiprecoz":"n/d","Precoz":"n/d"},"filas":[{"cultivar":"NS 7209 IPRO","criadero":"NIDERA (SYNGENTA)","ciclo":"Intermedio","kg":3146,"dif":10.5,"anio":2023,"kg2":null,"dif2":null,"anios2":null},{"cultivar":"NS 6248","criadero":"NIDERA (SYNGENTA)","ciclo":"Intermedio","kg":2751,"dif":-3.4,"anio":2023,"kg2":null,"dif2":null,"anios2":null},{"cultivar":"NS 6483 RR","criadero":"NIDERA (SYNGENTA)","ciclo":"Intermedio","kg":2644,"dif":-7.1,"anio":2023,"kg2":null,"dif2":null,"anios2":null},{"cultivar":"M-6410 IPRO","criadero":"MAGUAR","ciclo":"Semiprecoz","kg":2260,"dif":9.3,"anio":2023,"kg2":null,"dif2":null,"anios2":null},{"cultivar":"DM 62R63 RSF","criadero":"DON MARIO","ciclo":"Semiprecoz","kg":2743,"dif":32.7,"anio":2023,"kg2":null,"dif2":null,"anios2":null},{"cultivar":"SOJAPAR R24","criadero":"SOJAPAR","ciclo":"Semiprecoz","kg":820,"dif":-60.3,"anio":2023,"kg2":null,"dif2":null,"anios2":null},{"cultivar":"SOJAPAR R19","criadero":"SOJAPAR","ciclo":"Semiprecoz","kg":2446,"dif":18.3,"anio":2023,"kg2":null,"dif2":null,"anios2":null},{"cultivar":"63I64 RSF IPRO","criadero":"NIDERA (SYNGENTA)","ciclo":"Precoz","kg":3135,"dif":11.6,"anio":2023,"kg2":null,"dif2":null,"anios2":null},{"cultivar":"NS 6012 RSF IPRO","criadero":"NIDERA (SYNGENTA)","ciclo":"Precoz","kg":2807,"dif":-0.1,"anio":2023,"kg2":null,"dif2":null,"anios2":null},{"cultivar":"AG 5909 RG","criadero":"ASGROW (BAYER)","ciclo":"Precoz","kg":2485,"dif":-11.5,"anio":2023,"kg2":null,"dif2":null,"anios2":null}]}]};
  function ensayosDe(cultivo, nombre) {
    if (!ENSAYOS || !nombre) return [];
    var cu = cultivoClave(cultivo), b = base(nombre), d = buscar(cultivo, nombre), bn = d ? base(d.nombre) : null, out = [];
    if (cu === 'soja' && ALIAS_SOJA[b]) b = ALIAS_SOJA[b];
    var igual = function (x) { var k = base(x); if (cu === 'soja' && ALIAS_SOJA[k]) k = ALIAS_SOJA[k]; return k === b || (bn && k === bn); };
    if (cu === 'soja') (ENSAYOS.soja || []).forEach(function (s) { s.filas.forEach(function (f) { if (igual(f.cultivar)) out.push({ sitio: s, f: f }); }); });
    if (cu === 'maiz') (ENSAYOS.maiz || []).forEach(function (s) { s.filas.forEach(function (f) { if (igual(f.hibrido)) out.push({ sitio: s, f: f }); }); });
    return out;
  }
  function signo(v, d) { return v == null ? '—' : (v > 0 ? '+' : '') + fmt(v, d == null ? 1 : d) + ' %'; }
  function ensayosHTML(mio, ref) {
    if (!mio) return '';
    var cu = cultivoClave(mio.cultivo); if (cu !== 'soja' && cu !== 'maiz') return '';
    var mats = []; if (mio.variedad) mats.push(['Tu material', mio.variedad]); if (ref && ref.variedad && base(ref.variedad) !== base(mio.variedad || '')) mats.push(['Lote elegido', ref.variedad]);
    if (!mats.length) return '';
    var dep = norm(mio.departamento), filas = [], sinDato = [];
    mats.forEach(function (m) {
      var l = ensayosDe(mio.cultivo, m[1]);
      if (!l.length) sinDato.push(m[1]);
      l.sort(function (x, y) { return (norm(y.sitio.departamento) === dep) - (norm(x.sitio.departamento) === dep) || String(x.sitio.loc).localeCompare(String(y.sitio.loc)); });
      l.forEach(function (x) {
        var f = x.f, s = x.sitio;
        if (cu === 'soja') filas.push('<tr><td>' + m[0] + '<div class="sub">' + esc(f.cultivar) + '</div></td><td>' + esc(s.loc) + '<div class="sub">' + esc(s.departamento) + '</div></td><td>Zafra ' + f.anio + '<div class="sub">ciclo ' + esc(String(f.ciclo).toLowerCase()) + '</div></td><td class="r"><b>' + fmt(f.kg, 0) + '</b></td><td class="r">' + signo(f.dif) + '</td><td class="r">' + (f.kg2 ? fmt(f.kg2, 0) + '<div class="sub">' + signo(f.dif2) + '</div>' : '—') + '</td></tr>');
        else filas.push('<tr><td>' + m[0] + '<div class="sub">' + esc(f.hibrido) + '</div></td><td>' + esc(s.loc) + '<div class="sub">' + esc(s.estado) + (s.siembra ? ' · siembra ' + esc(s.siembra) : '') + '</div></td><td>' + esc(s.zafra) + '<div class="sub">grupo ' + esc(f.grupo) + '</div></td><td class="r"><b>' + fmt(f.kg, 0) + '</b><div class="sub">' + fmt(f.sc, 1) + ' sc/ha</div></td><td class="r">' + signo(f.dif) + '</td><td class="r">' + fmt(f.promEnsayoSc * 60, 0) + '</td></tr>');
      });
    });
    var titulo = cu === 'soja' ? 'Los materiales en los ensayos del IPTA (Paraguay)' : 'Los materiales en los ensayos de Fundação MS (maíz zafriña 2026)';
    var fuente = cu === 'soja' ? F.ipta : F.fmsMilho;
    var h = '<div style="font-weight:700;margin-top:14px;">' + titulo + '</div>';
    if (!filas.length) return h + '<div class="muted" style="font-size:12px;margin-top:4px;">' + mats.map(function (m) { return esc(m[1]); }).join(' y ') + (mats.length > 1 ? ' no están' : ' no está') + ' en los ensayos públicos ' + (cu === 'soja' ? 'del IPTA (6 localidades de Paraguay, hasta la zafra 2024)' : 'de Fundação MS (Ponta Porã, Rio Brilhante y Anaurilândia, safrinha 2026)') + '. Fuente: ' + linkF(fuente.url, fuente.n) + '.</div>';
    var enc = cu === 'soja' ? '<th>Material</th><th>Localidad</th><th>Zafra</th><th class="r">Rinde kg/ha</th><th class="r">Frente al promedio del ensayo</th><th class="r">Promedio 2 zafras</th>' : '<th>Material</th><th>Localidad</th><th>Ensayo</th><th class="r">Rinde kg/ha</th><th class="r">Frente al promedio del grupo</th><th class="r">Promedio del grupo kg/ha</th>';
    return h + '<div class="tablewrap" style="margin-top:6px;"><div class="tablescroll"><table class="tbl"><thead><tr>' + enc + '</tr></thead><tbody>' + filas.join('') + '</tbody></table></div></div>' +
      (sinDato.length ? '<div class="muted" style="font-size:12px;margin-top:4px;">' + sinDato.map(esc).join(' y ') + (sinDato.length > 1 ? ' no están' : ' no está') + ' en estos ensayos.</div>' : '') +
      '<div class="muted" style="font-size:11px;margin-top:4px;">Ensayos con el mismo manejo para todos los materiales de cada localidad. ' + (cu === 'soja' ? 'Lo que mejor compara es el % frente al promedio del ensayo: el rinde absoluto cambia mucho de un año a otro.' : 'Promedio del grupo calculado por SAFIA con los híbridos del mismo grupo de ciclo del ensayo.') + ' Fuente: ' + linkF(fuente.url, fuente.n) + '. Copia del 28-sep-2026.</div>';
  }

  /* ---------- qué material conviene para una zona (prospecto sin historia) ---------- */
  // Los que mejor anduvieron en los ensayos públicos frente al promedio de cada ensayo (DIF), en su departamento si hay
  function mejoresEnsayos(caso, cuantos) {
    var cu = cultivoClave(caso && caso.cultivo), out = [];
    if (!ENSAYOS) return { filas: [], ambito: '' };
    // los ensayos publicados son de la Región Oriental y de Mato Grosso do Sul: no representan al Chaco
    if (CHACO.test(norm(caso.departamento))) return { filas: [], ambito: 'chaco' };
    if (cu === 'soja') {
      var dep = norm(caso.departamento), sitios = (ENSAYOS.soja || []).filter(function (s) { return norm(s.departamento) === dep; }), ambito = caso.departamento;
      if (!sitios.length) { sitios = ENSAYOS.soja || []; ambito = 'las 6 localidades del IPTA'; }
      var acc = {};
      sitios.forEach(function (s) { s.filas.forEach(function (f) { var k = base(f.cultivar); if (ALIAS_SOJA[k]) k = ALIAS_SOJA[k]; (acc[k] = acc[k] || { nombre: f.cultivar, difs: [], sitios: [] }); acc[k].difs.push(f.dif); if (acc[k].sitios.indexOf(s.loc) < 0) acc[k].sitios.push(s.loc); }); });
      out = Object.keys(acc).map(function (k) { var a = acc[k]; return { nombre: a.nombre, dif: a.difs.reduce(function (x, y) { return x + y; }, 0) / a.difs.length, n: a.difs.length, sitios: a.sitios, dato: buscar('soja', a.nombre) }; });
      return { filas: out.sort(function (a, b) { return b.dif - a.dif; }).slice(0, cuantos || 5), ambito: ambito, fuente: F.ipta };
    }
    if (cu === 'maiz') {
      var acm = {};
      (ENSAYOS.maiz || []).forEach(function (s) { s.filas.forEach(function (f) { var k = base(f.hibrido); (acm[k] = acm[k] || { nombre: f.hibrido, difs: [], sitios: [], grupo: f.grupo }); acm[k].difs.push(f.dif); if (acm[k].sitios.indexOf(s.loc) < 0) acm[k].sitios.push(s.loc); }); });
      out = Object.keys(acm).map(function (k) { var a = acm[k]; return { nombre: a.nombre, grupo: a.grupo, dif: a.difs.reduce(function (x, y) { return x + y; }, 0) / a.difs.length, n: a.difs.length, sitios: a.sitios, dato: buscar('maiz', a.nombre) }; });
      return { filas: out.filter(function (x) { return x.n >= 2; }).sort(function (a, b) { return b.dif - a.dif; }).slice(0, cuantos || 5), ambito: 'Ponta Porã, Rio Brilhante y Anaurilândia (MS, safrinha 2026), en al menos 2 de las 3', fuente: F.fmsMilho };
    }
    return { filas: [], ambito: '' };
  }
  function recomendacionHTML(caso, lider) {
    var cu = cultivoClave(caso && caso.cultivo); if (cu !== 'soja' && cu !== 'maiz') return '';
    var h = '<div style="font-weight:700;margin-top:14px;">Qué material conviene para este campo</div><ul style="margin:6px 0 0 18px;padding:0;font-size:13px;line-height:1.55;">';
    if (cu === 'soja') { var z = zonaGM(caso); if (z) h += '<li><b>Grupo de madurez:</b> ' + esc(ubicacionTexto(caso)) + ' ' + esc(z.texto.charAt(0).toUpperCase() + z.texto.slice(1)) + '. <span class="muted" style="font-size:11px;">(' + linkF((z.fuentes[0] || F.inbio).url, 'INBIO') + ')</span></li>'; }
    if (cu === 'maiz') h += '<li><b>Ciclo:</b> en zafriña (siembra desde mediados de febrero) conviene un híbrido más precoz para escapar de la helada al final del ciclo; cuanto más tarde la siembra, menor el potencial. <span class="muted" style="font-size:11px;">(' + linkF(F.embrapaMilhoPasso.url, 'Embrapa') + ')</span></li>';
    if (lider && lider.variedad) { var dl = buscar(caso.cultivo, lider.variedad); h += '<li><b>El líder de la zona sembró ' + esc(lider.variedad) + '</b>' + (dl ? (cu === 'soja' ? (dl.gm != null ? ' (GM ' + fmt(dl.gm, 1) + (dl.habito ? ', ' + dl.habito : '') + ')' : '') : (dl.ciclo ? ' (' + dl.ciclo + ')' : '')) : ' (sin ficha verificada)') + (lider.epoca ? ', en ' + esc(lider.epoca).toLowerCase() : '') + (lider.siembra ? ', sembrado el ' + esc(String(lider.siembra).slice(8, 10) + '/' + String(lider.siembra).slice(5, 7)) : '') + '.</li>'; }
    h += '</ul>';
    var me = mejoresEnsayos(caso, 5);
    if (me.filas.length) h += '<div class="tablewrap" style="margin-top:6px;"><div class="tablescroll"><table class="tbl"><thead><tr><th>Los que mejor anduvieron en ensayos</th><th>' + (cu === 'soja' ? 'GM' : 'Ciclo') + '</th><th class="r">Frente al promedio del ensayo</th><th>Dónde</th></tr></thead><tbody>' +
      me.filas.map(function (x) { var d = x.dato; return '<tr><td><b>' + esc(x.nombre) + '</b></td><td>' + (d ? (cu === 'soja' ? (d.gm != null ? fmt(d.gm, 1) : '—') : esc(d.ciclo || d.senave || '—')) : (x.grupo ? esc(x.grupo) : '<span class="muted">sin ficha</span>')) + '</td><td class="r"><b style="color:' + (x.dif >= 0 ? '#178029' : '#B3261E') + ';">' + (x.dif > 0 ? '+' : '') + fmt(x.dif, 1) + ' %</b><div class="sub">' + x.n + ' ensayo' + (x.n > 1 ? 's' : '') + '</div></td><td style="white-space:normal;">' + esc(x.sitios.join(', ')) + '</td></tr>'; }).join('') +
      '</tbody></table></div></div><div class="muted" style="font-size:11px;margin-top:4px;">Ensayos públicos en ' + esc(me.ambito) + ', misma forma de manejo para todos los materiales de cada ensayo. Fuente: ' + linkF(me.fuente.url, me.fuente.n) + '. Probar primero en una franja del lote.</div>';
    else if (me.ambito === 'chaco') h += '<div class="muted" style="font-size:12px;margin-top:4px;">Los ensayos públicos que tiene SAFIA (IPTA en la Región Oriental y Fundação MS en Mato Grosso do Sul) no representan al Chaco. Para el Chaco la referencia es la red de ensayos de IDEAGRO, que publica sus resultados solo en PDF: ' + linkF(F.ideagro.url, F.ideagro.n) + '.</div>';
    else if (cu === 'soja') h += '<div class="muted" style="font-size:12px;margin-top:4px;">No hay ensayos públicos de variedades de soja con rinde para esta zona.</div>';
    return h;
  }

  /* ---------- por qué el material importa ---------- */
  function notaHTML(cultivo) {
    var cu = cultivoClave(cultivo), items;
    if (cu === 'soja') items = [
      ['Grupo de madurez y latitud.', 'Cada variedad florece según el largo del día (fotoperíodo): rinde bien en una franja de latitud y época, y fuera de ella florece antes o después de lo ideal.', F.embrapaSoja],
      ['En Paraguay.', 'INBIO recomienda GM 5.8 a 6.4 al sur del paralelo 25 (arrancar con ciclo largo y cerrar con ciclo corto) y variedades rústicas de GM 6.2 en adelante al norte, donde se siembra desde fines de septiembre con más calor y suelos más arenosos; en los suelos arcillosos (Alto Paraná, este de Canindeyú) pide variedades de alto rendimiento.', F.inbio],
      ['Época × variedad.', 'No todas responden igual a la fecha: en Maracaju (Fundação MS), pasar la siembra de septiembre a octubre subió 406 kg/ha en M 6410 IPRO y bajó 728 kg/ha en TEC 7849 IPRO.', F.fundacaoMS],
      ['Hábito de crecimiento.', 'Las indeterminadas toleran mejor adelantar la siembra; en siembras tardías convienen las menos sensibles al fotoperíodo.', F.embrapaSoja],
      ['Sanidad.', 'Hay variedades resistentes a roya asiática o a nematodo de quiste y otras susceptibles; en lotes con esos problemas, la variedad pesa mucho en el rinde.', F.embrapaSoja],
      ['IPRO / Intacta.', 'Protege contra las principales orugas, pero no controla Spodoptera, chinches ni ácaros y no sube el potencial de rinde; exige refugio.', F.embrapaSoja],
      ['Cuánto pesa.', 'En el Chaco (red IDEAGRO 2025/26) el ambiente explicó el 82 % de la diferencia de rinde y la variedad solo el 2,5 %. En la Región Oriental la variedad sí pesa: en Maracaju hubo de 3.756 a 4.818 kg/ha con el mismo manejo.', F.ideagro]
    ];
    else if (cu === 'maiz') items = [
      ['Ciclo y grados-día.', 'Cada híbrido necesita una cantidad fija de calor (grados-día) para florecer y madurar; el ciclo se elige por esa suma térmica.', F.embrapaMilhoPasso],
      ['Calor.', 'Con mucho calor el ciclo se acorta y baja el rinde, porque el llenado de grano dura menos. Los hiper y superprecoces en general no son los más productivos.', F.embrapaMilho2010],
      ['Zafriña.', 'En siembras desde mediados de febrero conviene un híbrido más precoz para escapar de la helada al final del ciclo; cuanto más tarde la siembra, menor el potencial.', F.embrapaMilhoPasso],
      ['Nivel del híbrido.', 'Los híbridos de alta tecnología van en los lotes más fértiles: en un lote con limitaciones no expresan su potencial.', F.embrapaDoc272],
      ['Densidad.', 'No todos toleran altas densidades; la mayoría se recomienda entre 55 y 75 mil plantas/ha, y en épocas de riesgo se baja la población.', F.embrapaDoc272],
      ['Grano o silaje.', 'El mejor híbrido para grano no siempre es el mejor para silaje; para silaje conviene evitar los hiper y superprecoces (menor ventana de corte).', F.embrapaSilagem],
      ['Clasificación en Paraguay.', 'SENAVE clasifica algunos híbridos distinto que las empresas en Brasil (por ejemplo AG 9035: superprecoz en Brasil, precoz para zafriña en Paraguay): SAFIA muestra las dos.', F.senave]
    ];
    else return '';
    return '<details style="margin-top:12px;"><summary style="cursor:pointer;font-weight:700;font-size:13px;">Por qué el material cambia el rinde (' + (cu === 'soja' ? 'soja' : 'maíz') + ')</summary><ul style="margin:6px 0 0 18px;padding:0;font-size:12.5px;line-height:1.55;">' +
      items.map(function (i) { return '<li style="margin-bottom:4px;"><b>' + i[0] + '</b> ' + i[1] + ' <span class="muted" style="font-size:11px;">(' + linkF(i[2].url, i[2].n) + ')</span></li>'; }).join('') + '</ul></details>';
  }

  // mapa del paralelo 25 en un contenedor cualquiera (lat/lon del campo opcionales)
  function mapaZona(div, lat, lon) { return cargarLeaflet().then(function () { return dibujarMapa(div, coord(lat), coord(lon)); }); }
  window.SafiaMateriales = { recomendacionHTML: recomendacionHTML, mejoresEnsayos: mejoresEnsayos, mapaZona: mapaZona, buscar: buscar, base: base, zonaGM: zonaGM, lectura: lectura, corto: corto, ensayosDe: ensayosDe, ensayosHTML: ensayosHTML, notaHTML: notaHTML, FUENTES: F };
})();
