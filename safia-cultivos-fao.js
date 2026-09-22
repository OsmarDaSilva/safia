/* SAFIA · catálogo de cultivos FAO (Kc y duración de etapas).
   Compartido por todas las páginas: se siembra solo en localStorage
   ("cultivos_fao") si falta, así el dashboard, la predicción y el balance
   funcionan en cualquier navegador sin pasar antes por "Cultivos". */
(function () {
  'use strict';
  window.TABLA_FAO = [
      { nombre: 'Maíz', emoji: '🌽', tipo: 'anual', kc_ini: 0.30, kc_med: 1.20, kc_fin: 0.60, L_ini: 30, L_des: 40, L_med: 45, L_fin: 30 },
      { nombre: 'Soja', emoji: '🌱', tipo: 'anual', kc_ini: 0.40, kc_med: 1.15, kc_fin: 0.50, L_ini: 20, L_des: 30, L_med: 60, L_fin: 25 },
      { nombre: 'Trigo', emoji: '🌾', tipo: 'anual', kc_ini: 0.30, kc_med: 1.15, kc_fin: 0.40, L_ini: 30, L_des: 40, L_med: 40, L_fin: 30 },
      { nombre: 'Arroz', emoji: '🌾', tipo: 'anual', kc_ini: 1.05, kc_med: 1.20, kc_fin: 0.70, L_ini: 30, L_des: 30, L_med: 60, L_fin: 30 },
      { nombre: 'Sorgo', emoji: '🌾', tipo: 'anual', kc_ini: 0.30, kc_med: 1.10, kc_fin: 0.55, L_ini: 20, L_des: 35, L_med: 45, L_fin: 30 },
      { nombre: 'Girasol', emoji: '🌻', tipo: 'anual', kc_ini: 0.35, kc_med: 1.15, kc_fin: 0.35, L_ini: 25, L_des: 35, L_med: 45, L_fin: 25 },
      { nombre: 'Algodón', emoji: '🌱', tipo: 'anual', kc_ini: 0.35, kc_med: 1.20, kc_fin: 0.60, L_ini: 30, L_des: 50, L_med: 60, L_fin: 55 },
      { nombre: 'Maní', emoji: '🥜', tipo: 'anual', kc_ini: 0.40, kc_med: 1.15, kc_fin: 0.60, L_ini: 25, L_des: 35, L_med: 45, L_fin: 25 },
      { nombre: 'Frijol/Poroto', emoji: '🫘', tipo: 'anual', kc_ini: 0.40, kc_med: 1.15, kc_fin: 0.35, L_ini: 20, L_des: 30, L_med: 30, L_fin: 15 },
      { nombre: 'Sésamo', emoji: '🌻', tipo: 'anual', kc_ini: 0.35, kc_med: 1.10, kc_fin: 0.25, L_ini: 20, L_des: 30, L_med: 40, L_fin: 20 },
      { nombre: 'Chía', emoji: '🌱', tipo: 'anual', kc_ini: 0.35, kc_med: 1.15, kc_fin: 0.40, L_ini: 25, L_des: 35, L_med: 45, L_fin: 25 },
      { nombre: 'Avena', emoji: '🌾', tipo: 'anual', kc_ini: 0.30, kc_med: 1.15, kc_fin: 0.40, L_ini: 25, L_des: 35, L_med: 35, L_fin: 25 },
      { nombre: 'Tomate', emoji: '🍅', tipo: 'anual', kc_ini: 0.60, kc_med: 1.15, kc_fin: 0.80, L_ini: 30, L_des: 40, L_med: 40, L_fin: 25 },
      { nombre: 'Lechuga', emoji: '🥬', tipo: 'anual', kc_ini: 0.70, kc_med: 1.00, kc_fin: 0.95, L_ini: 20, L_des: 25, L_med: 20, L_fin: 10 },
      { nombre: 'Alfalfa', emoji: '🌿', tipo: 'perenne', kc_pri: 0.85, kc_ver: 1.20, kc_oto: 0.95, kc_inv: 0.40 },
      { nombre: 'Pasturas', emoji: '🌾', tipo: 'perenne', kc_pri: 0.70, kc_ver: 0.95, kc_oto: 0.85, kc_inv: 0.50 },
      { nombre: 'Cítricos', emoji: '🍊', tipo: 'perenne', kc_pri: 0.75, kc_ver: 0.80, kc_oto: 0.75, kc_inv: 0.70 },
      { nombre: 'Vid (uva)', emoji: '🍇', tipo: 'perenne', kc_pri: 0.30, kc_ver: 0.85, kc_oto: 0.45, kc_inv: 0.20 },
      { nombre: 'Café', emoji: '☕', tipo: 'perenne', kc_pri: 0.90, kc_ver: 1.05, kc_oto: 0.95, kc_inv: 0.90 },
      { nombre: 'Banana', emoji: '🍌', tipo: 'perenne', kc_pri: 0.50, kc_ver: 1.10, kc_oto: 1.00, kc_inv: 0.50 },
      { nombre: 'Palta/Aguacate', emoji: '🥑', tipo: 'perenne', kc_pri: 0.60, kc_ver: 0.85, kc_oto: 0.75, kc_inv: 0.55 },
      { nombre: 'Caña de azúcar', emoji: '🌾', tipo: 'perenne', kc_pri: 0.40, kc_ver: 1.25, kc_oto: 0.75, kc_inv: 0.40 },
  ];
  try {
    var actual = JSON.parse(localStorage.getItem('cultivos_fao') || '[]');
    if (!Array.isArray(actual) || actual.length < window.TABLA_FAO.length) {
      localStorage.setItem('cultivos_fao', JSON.stringify(window.TABLA_FAO));
    }
  } catch (e) {}
})();
