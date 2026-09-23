/* SAFIA — Catálogo regional (América Latina: Paraguay, Brasil, Argentina)
   -------------------------------------------------------------------
   Listas precargadas para que cargar sea rápido: variedades e híbridos
   por cultivo, e insumos por categoría. Son SUGERENCIAS para
   autocompletar: siempre se puede escribir otro nombre. Las listas se
   completan solas con lo que cada cliente va usando.
   Fuentes consultadas (sep-2026): jornadas de campo y notas técnicas de
   Paraguay (Campo Agropecuario, Productiva, Valor Agrícola, Revista
   FOCO), obtentores (Brasmax/Don Mario, Nidera/Syngenta, Monsoy,
   TMG, Pioneer/Corteva, Dekalb, Agroceres/Agroeste, Brevant, KWS, LG),
   IPTA/CAPECO/INBIO (trigo Itapúa y Canindé, Biotrigo TBIO), Embrapa
   (sistema Santa Fé), BASF/Bayer/Syngenta/Adama Paraguay (protección y
   tratamiento de semillas), Rizobacter (inoculantes), fertirrigación
   (Nutrição de Safras, AGREDU). */
(function () {
  'use strict';

  var VARIEDADES = {
    'Soja': [
      // Brasmax / Don Mario
      'BMX Zeus IPRO', 'BMX Potência RR', 'BMX Lança IPRO', 'BMX Bônus IPRO', 'BMX Olimpo IPRO', 'BMX Fibra IPRO', 'BMX Compacta IPRO', 'BMX Garra IPRO', 'BMX Cromo', 'BMX Lotus', 'BMX Ícone IPRO', 'BMX Ativa RR', 'BMX Turbo RR', 'BMX Desafio RR',
      'DM 53i54 IPRO', 'DM 5958 IPRO', 'DM 60i62 IPRO', 'DM 62R63', 'DM 66i68 IPRO', 'DM 68i69 IPRO', 'DM 5.8i', 'DM 6.2i',
      // Nidera / Syngenta
      'NA 5909 RG', 'NS 5445 IPRO', 'NS 5933 IPRO', 'NS 6010 IPRO', 'NS 6220 IPRO', 'NS 6248 RR', 'NS 6483 RR', 'NS 6906 IPRO', 'NS 7209 IPRO', 'SYN 1561 IPRO', 'SYN 13671 IPRO', 'SYN 15640 IPRO',
      // Monsoy (Bayer)
      'M 5705 IPRO', 'M 5892 IPRO', 'M 5917 IPRO', 'M 5947 IPRO', 'M 6110 IPRO', 'M 6210 IPRO', 'M 6410 IPRO',
      // TMG
      'TMG 7062 IPRO', 'TMG 7063 IPRO', 'TMG 7067 IPRO', 'TMG 7362 IPRO', 'TMG 2378 IPRO', 'TMG 2381 IPRO',
      // Credenz (BASF)
      'CZ 15B21', 'CZ 26B42 IPRO', 'CZ 37B43 IPRO', 'CZ 48B32 IPRO',
      // Pioneer (Corteva)
      'P95R51', 'P95R96', 'P96R29', 'P97R21', 'P95Y72'
    ],
    'Maíz': [
      // Pioneer
      'P1972 VYHR', 'P2530 VYH', 'P3010 VYH', 'P3016 VYH', 'P3282 VYHR', 'P3340 VYHR', 'P3862 VYHR', 'P4285 YHR', '30F35 VYH', '30A37 PW',
      // Dekalb (Bayer)
      'DKB 177 PRO3', 'DKB 230 PRO3', 'DKB 255 PRO3', 'DKB 265 PRO3', 'DKB 290 PRO3', 'DKB 310 PRO3', 'DKB 360 PRO3', 'DKB 390 PRO3',
      // Agroceres / Agroeste
      'AG 7098 PRO2', 'AG 8088 PRO3', 'AG 8780 PRO3', 'AG 9010 PRO3', 'AS 1666 PRO3', 'AS 1730 PRO3', 'AS 1757 PRO3', 'AS 1868 PRO3',
      // Syngenta
      'Status VIP3', 'Feroz VIP3', 'Supremo VIP3', 'Fórmula VIP3', 'Impacto VIP3', 'Defender VIP3', 'SYN 505 VIP3', 'SYN 522 VIP3',
      // Brevant (Corteva)
      'B2401 PWU', 'B2620 PWU', 'B2702 PWU', 'B2718 PWU', 'B2801 PWU',
      // KWS / LG / Morgan
      'K7500 VIP3', 'K9606 VIP3', 'K9960 VIP3', 'LG 6033 PRO3', 'LG 6036 PRO3', 'MG 300 PW', 'MG 580 PW', 'MG 652 PW'
    ],
    'Trigo': [
      // IPTA / CAPECO / INBIO (Paraguay)
      'Itapúa 75', 'Itapúa 80', 'Itapúa 85', 'Itapúa 90', 'Itapúa 95', 'Canindé 1', 'Canindé 11', 'Canindé 12', 'Canindé 21', 'Canindé 31',
      // Biotrigo
      'TBIO Toruk', 'TBIO Ponteiro', 'TBIO Sonic', 'TBIO Sossego', 'TBIO Audaz', 'TBIO Astro', 'TBIO Aton', 'TBIO Duque', 'TBIO Trunfo',
      // OR / Coodetec / Embrapa
      'ORS 1403', 'ORS 1405', 'ORS Feroz', 'ORS Madrepérola', 'CD 1303', 'CD 1440', 'BRS Guamirim', 'BRS 264', 'BRS 331'
    ],
    'Girasol': ['SYN 3970 CL', 'SYN 3950 CL', 'NK Neruda', 'ADV 5504 CL', 'ADV 5203', 'Paraíso 20', 'Paraíso 33', 'Aguará 4', 'Aguará 6', 'DK 4040'],
    'Sorgo': ['DKB 599', 'DKB 590', 'DKB 540', 'BRS 330', 'BRS 373', 'AG 1090', 'Nugrain 430', 'MG 1290', '1G100', '50A50'],
    'Poroto / Frijol': ['BRS Estilo', 'BRS Esteio', 'BRS Pérola', 'BRS FC402', 'IPR Tangará', 'IPR Campos Gerais', 'Carioca', 'San Francisco', 'Kumanda yvyra\'i', 'Poroto manteca'],
    'Arroz': ['IRGA 424 RI', 'IRGA 431 CL', 'Guri INTA CL', 'Puitá INTA CL', 'BRS Pampa', 'BRS Pampeira', 'Taim'],
    'Canola': ['Hyola 433', 'Hyola 571 CL', 'Hyola 575 CL', 'Diamond', 'Hyola 61'],
    'Avena': ['IPR Afrodite', 'IPR Artemis', 'URS Guapa', 'URS Corona', 'IAPAR 61', 'Embrapa 29 Garoa', 'Avena negra común'],
    'Brachiaria': ['Brachiaria ruziziensis', 'Brachiaria brizantha Marandu', 'Brachiaria brizantha Piatã', 'Brachiaria brizantha Xaraés', 'Brachiaria decumbens', 'Brachiaria híbrida Mulato II']
  };
  // Cultivos que en la práctica se nombran distinto (para encontrar la lista)
  var ALIAS_CULTIVO = { 'soya': 'Soja', 'maiz': 'Maíz', 'maíz': 'Maíz', 'zafriña': 'Maíz', 'poroto': 'Poroto / Frijol', 'frijol': 'Poroto / Frijol', 'feijao': 'Poroto / Frijol', 'porotos': 'Poroto / Frijol', 'brachiaria': 'Brachiaria', 'braquiaria': 'Brachiaria', 'brizanta': 'Brachiaria' };

  var INSUMOS = {
    // 1. Semilla
    ts_como:        ['CoMo Nitragin', 'CoMo Platinum', 'Biomol', 'Rizobacter CoMo', 'Nectar CoMo', 'Molibdato de sodio + sulfato de cobalto'],
    inoculante:     ['Nitragin Cell Tech HC (Bradyrhizobium)', 'Rizoliq LLI (Bradyrhizobium)', 'Rizoliq Top', 'Gelfix 5 (Bradyrhizobium)', 'Masterfix L Soja', 'Biagro NG', 'HiCoat S30 (BASF)', 'Simbiose Nod', 'Azototal (Azospirillum, maíz/trigo)', 'AzoMax (Azospirillum)', 'Masterfix Gramíneas (Azospirillum)', 'Nitro 1000 Gramíneas (Azospirillum)'],
    coinoculante:   ['Azospirillum brasilense (Azototal)', 'Azospirillum brasilense (AzoMax)', 'Azospirillum brasilense (Masterfix Gramíneas)', 'Rizofos (Pseudomonas)', 'Rizoliq Duo (Bradyrhizobium + Azospirillum)', 'Bacillus subtilis'],
    ts_insecticida: ['Cruiser 350 FS (tiametoxam)', 'Gaucho 600 FS (imidacloprid)', 'Fortenza Duo (ciantraniliprole + tiametoxam)', 'Fortenza 600 FS', 'Poncho (clotianidina)', 'Dermacor (clorantraniliprole)', 'Cropstar (imidacloprid + tiodicarb)', 'Standak (fipronil)'],
    ts_fungicida:   ['Standak Top (fipronil + piraclostrobina + tiofanato)', 'Vitavax-Thiram 200 SC', 'Maxim XL', 'Maxim Advanced', 'Rancona T', 'Derosal Plus', 'Certeza N', 'Protreat'],
    ts_micro:       ['Zinc para semilla (Zn)', 'Manganeso para semilla (Mn)', 'Boro para semilla (B)', 'Molibdeno (Mo)', 'Zn + Mn semilla', 'Rizobacter Premax'],
    ts_bio:         ['Stimulate (Stoller)', 'Bio-Forge', 'Aminoácidos para semilla', 'Polímero / película (film coating)', 'Trichoderma (Trichodermil)', 'Extracto de algas'],
    ts_otro:        ['Grafito', 'Talco', 'Colorante'],
    // 2. Fertilización
    fert_base:      ['04-30-10', '02-20-18', '05-25-25', '08-20-20', '00-20-20', '10-30-10', '12-24-12', '09-42-00', '03-30-00', '02-18-18', 'MAP 11-52-00', 'DAP 18-46-00', 'SSP 00-18-00', 'TSP 00-46-00', 'KCl 00-00-60', 'Yoorin (termofosfato)'],
    fert_cobertura: ['Urea 46-00-00', 'KCl 00-00-60', 'Sulfato de amonio 21-00-00', 'Nitrato de amonio 33-00-00', '20-00-20', '30-00-10', '25-00-25', 'Urea + KCl mezcla', 'Sulfato de potasio 00-00-50'],
    fertirriego:    ['Urea 46-00-00', 'Nitrato de potasio 13-00-46', 'MAP purificado 12-61-00', 'MKP fosfato monopotásico 00-52-34', 'Nitrato de calcio 15-00-00', 'Nitrato de magnesio 11-00-00', 'Sulfato de magnesio (Epsom)', 'Sulfato de potasio soluble 00-00-50', 'Cloruro de potasio soluble 00-00-60', 'UAN 32-00-00', 'Nitrato de amonio 33-00-00', 'Quelato de micronutrientes (EDTA)', 'Ácido fosfórico'],
    encalado:       ['Calcáreo dolomítico', 'Calcáreo calcítico', 'Cal agrícola', 'Yeso agrícola', 'Calcáreo + yeso (mezcla)'],
    // 3. Ciclo
    foliar_micro:   ['Zinc foliar (Zn)', 'Manganeso foliar (Mn)', 'Boro foliar (B)', 'Molibdeno foliar (Mo)', 'Cobre (Cu)', 'Zn + Mn + B', 'Quelato NPK + micros', 'Sulfato de manganeso', 'Ácido bórico'],
    foliar_bio:     ['Stimulate (Stoller)', 'Bio-Forge', 'Kelpak (algas)', 'Extracto de algas Ascophyllum', 'Aminoácidos foliares', 'Fosfito de potasio', 'Fosfito de manganeso', 'Fertiactyl'],
    fungicida:      ['Fox Xpro', 'Fox', 'Elatus', 'Ativum', 'Aproach Prima', 'Aproach Power', 'Priori Xtra', 'Opera', 'Sphere Max', 'Orkestra SC', 'Vessarya', 'Cypress', 'Nativo', 'Cronnos', 'Somax', 'Palyvar', 'Unizeb Gold (mancozeb)', 'Unizeb Glory', 'Previnil (clorotalonil)', 'Bravonil', 'Mancozeb', 'Score', 'Tilt', 'Mirador'],
    insecticida:    ['Engeo Pleno S', 'Ampligo', 'Connect', 'Belt', 'Exalt', 'Premio', 'Pirate', 'Curyom', 'Lannate', 'Lorsban 480', 'Karate Zeon', 'Bulldock', 'Talstar', 'Sperto', 'Voliam Flexi', 'Match', 'Certero', 'Galil', 'Perito', 'Acefato (Orthene)', 'Metomil', 'Tiametoxam + lambda-cialotrina', 'Clorpirifós'],
    herbicida:      ['Glifosato (Roundup / Zapp)', '2,4-D', 'Dicamba (Atectra)', 'Paraquat (Gramoxone)', 'Diquat (Reglone)', 'Glufosinato de amonio (Finale)', 'Diclosulam (Spider)', 'Clorimurón (Classic)', 'Flumioxazin (Flumyzin)', 'Sulfentrazone (Boral)', 'Imazetapir (Pivot)', 'Cletodim (Select)', 'Haloxifop (Verdict)', 'Atrazina', 'S-metolacloro (Dual Gold)', 'Tembotrione (Soberan)', 'Nicosulfurón (Sanson)', 'Mesotrione (Callisto)', 'Fomesafen (Flex)', 'Lactofen (Cobra)', 'Saflufenacil (Heat)', 'Carfentrazone (Aurora)', 'Metsulfurón (Ally)'],
    otro:           ['Adherente / aceite mineral', 'Regulador de pH', 'Antiespumante']
  };

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function variedadesDe(cultivo) {
    var n = norm(cultivo); if (!n) return [];
    var base = n.split(/[\s(]/)[0];
    var clave = Object.keys(VARIEDADES).find(function (k) { return norm(k) === n || norm(k).split(' ')[0] === base; });
    if (!clave && ALIAS_CULTIVO[base]) clave = ALIAS_CULTIVO[base];
    return clave ? VARIEDADES[clave] : [];
  }
  function insumosDe(categoria) { return INSUMOS[categoria] || []; }

  window.SafiaCatalogo = { VARIEDADES: VARIEDADES, INSUMOS: INSUMOS, variedadesDe: variedadesDe, insumosDe: insumosDe };
})();
