import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PAGE_SIZE } from '../api/fetchAll';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('120 筆分成 3 頁，第一頁顯示 1–50', () => {
    render(
      <Pagination total={120} page={1} onChange={vi.fn()} pageSize={PAGE_SIZE} unit="位會員" />
    );

    expect(screen.getByText(/第 1–50 筆，共 120 筆位會員/)).toBeInTheDocument();
    expect(screen.getByText('／ 共 3 頁')).toBeInTheDocument();
  });

  it('最後一頁的區間夾在總筆數內，不會顯示 101–150', () => {
    render(<Pagination total={120} page={3} onChange={vi.fn()} pageSize={PAGE_SIZE} />);

    expect(screen.getByText(/第 101–120 筆/)).toBeInTheDocument();
  });

  it('只有一頁時完全不渲染 —— 按不動的分頁列只是雜訊', () => {
    const { container } = render(
      <Pagination total={12} page={1} onChange={vi.fn()} pageSize={PAGE_SIZE} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('第一頁的「上一頁」與最後一頁的「下一頁」是停用的', () => {
    const { rerender } = render(
      <Pagination total={120} page={1} onChange={vi.fn()} pageSize={PAGE_SIZE} />
    );
    expect(screen.getByRole('button', { name: '上一頁' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一頁' })).toBeEnabled();

    rerender(<Pagination total={120} page={3} onChange={vi.fn()} pageSize={PAGE_SIZE} />);
    expect(screen.getByRole('button', { name: '上一頁' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '下一頁' })).toBeDisabled();
  });

  it('按下一頁會回報下一個頁碼', async () => {
    const onChange = vi.fn();
    render(<Pagination total={120} page={2} onChange={onChange} pageSize={PAGE_SIZE} />);

    await userEvent.click(screen.getByRole('button', { name: '下一頁' }));

    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('可以用頁碼選單直接跳頁', async () => {
    const onChange = vi.fn();
    render(<Pagination total={120} page={1} onChange={onChange} pageSize={PAGE_SIZE} />);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '跳到指定頁' }), '3');

    expect(onChange).toHaveBeenCalledWith(3);
  });
});
