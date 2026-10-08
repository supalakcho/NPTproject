// ช่องรับรหัสครุภัณฑ์: เครื่องสแกน USB ทำงานเหมือนคีย์บอร์ดแล้วส่ง Enter ค้นหาทันที ไม่ต้องใช้ library
import { h } from '../core/dom.js';

/**
 * @param {{ label?: string, placeholder?: string, onScan: (code: string) => void }} opts
 * @returns {{ el: HTMLElement, input: HTMLInputElement, focus: () => void }}
 */
export function barcodeInput({ label = 'สแกนหรือพิมพ์รหัสครุภัณฑ์', placeholder = 'เช่น NB-2025-0007', id = 'barcode-input', onScan }) {
  const input = h('input', {
    type: 'text', id, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder,
  });

  const submit = () => {
    const code = input.value.trim();
    if (!code) return;
    input.value = '';
    onScan(code);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });

  const el = h('div', { class: 'field' },
    h('label', { for: id }, label),
    h('div', { class: 'btn-row' }, input, h('button', { class: 'btn', type: 'button', onClick: submit }, 'ค้นหา')));
  input.style.flex = '1 1 200px';

  return { el, input, focus: () => input.focus() };
}
