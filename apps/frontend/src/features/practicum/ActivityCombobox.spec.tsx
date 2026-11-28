// @vitest-environment happy-dom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ActivityCombobox } from './ActivityCombobox';
afterEach(cleanup);
function Picker() {
  const [value, setValue] = useState('Atención');
  return (
    <ActivityCombobox
      label="Proyecto"
      value={value}
      onChange={setValue}
      disabled={false}
      placeholder="Selecciona o escribe"
      options={[
        { value: 'Atención' },
        { value: 'Taller', detail: 'Asignada por el Director' },
      ]}
    />
  );
}
it('opens the entire list on focus and selects a saved option using the keyboard', () => {
  render(<Picker />);
  const input = screen.getByRole('combobox', { name: 'Proyecto' });
  fireEvent.focus(input);
  expect(screen.getAllByRole('option')).toHaveLength(2);
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect((input as HTMLInputElement).value).toBe('Taller');
  expect(screen.queryByRole('listbox')).toBeNull();
});
it('filters suggestions, accepts new text and closes the list on Escape without propagating it', () => {
  render(<Picker />);
  const input = screen.getByRole('combobox', { name: 'Proyecto' });
  fireEvent.change(input, { target: { value: 'Tall' } });
  expect(screen.getAllByRole('option')).toHaveLength(1);
  fireEvent.click(screen.getByRole('option', { name: /Taller/u }));
  expect((input as HTMLInputElement).value).toBe('Taller');
  fireEvent.change(input, { target: { value: 'Investigación nueva' } });
  expect(screen.queryAllByRole('option')).toHaveLength(0);
  expect(
    screen.getByText('También puedes escribir una opción nueva.'),
  ).toBeDefined();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
  expect((input as HTMLInputElement).value).toBe('Investigación nueva');
});
