// ช่องวันเวลา: ใช้ <input type="datetime-local"> ตีความค่าเป็นเวลาไทยเสมอ แล้วแปลงเป็น ISO +07:00
import { h } from '../core/dom.js';
import { isoToLocalInput, localInputToIso } from '../utils/datetime.js';
import { createField } from './fieldError.js';

/** @param {{ name: string, label: string, min?: string, max?: string, value?: string, hint?: string }} cfg ค่า min/max/value เป็น ISO */
export function dateTimeField({ name, label, min, max, value, hint, idPrefix }) {
  return createField({
    name, label, type: 'datetime-local', hint, idPrefix,
    value: value ? isoToLocalInput(value) : '',
    attrs: { min: min ? isoToLocalInput(min) : null, max: max ? isoToLocalInput(max) : null },
  });
}

/** ค่าของช่องวันเวลาเป็น ISO +07:00 (null ถ้ายังไม่เลือก) */
export function getIsoValue(root, name) {
  return localInputToIso(root.querySelector(`[name="${name}"]`)?.value);
}

export function setIsoValue(root, name, iso) {
  const input = root.querySelector(`[name="${name}"]`);
  if (input) input.value = iso ? isoToLocalInput(iso) : '';
}

export function setIsoLimits(root, name, { min, max }) {
  const input = root.querySelector(`[name="${name}"]`);
  if (!input) return;
  if (min !== undefined) min ? input.setAttribute('min', isoToLocalInput(min)) : input.removeAttribute('min');
  if (max !== undefined) max ? input.setAttribute('max', isoToLocalInput(max)) : input.removeAttribute('max');
}

/**
 * คู่ช่อง เริ่ม–สิ้นสุด
 * @returns {{ el: HTMLElement, getValue: () => { startAt: string|null, endAt: string|null }, setValue: (v: {startAt?: string, endAt?: string}) => void }}
 */
export function dateTimeRange({ startName = 'startAt', endName = 'endAt', startLabel = 'เริ่ม', endLabel = 'สิ้นสุด', min, max, start, end } = {}) {
  const el = h('div', null,
    dateTimeField({ name: startName, label: startLabel, min, max, value: start }),
    dateTimeField({ name: endName, label: endLabel, min, max, value: end }));
  return {
    el,
    getValue: () => ({ startAt: getIsoValue(el, startName), endAt: getIsoValue(el, endName) }),
    setValue: ({ startAt, endAt }) => {
      if (startAt !== undefined) setIsoValue(el, startName, startAt);
      if (endAt !== undefined) setIsoValue(el, endName, endAt);
    },
  };
}
