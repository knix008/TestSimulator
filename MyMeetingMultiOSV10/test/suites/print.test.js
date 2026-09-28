import { parsePageRange, DEFAULT_PRINT_OPTIONS } from '../../src/components/PrintDialog.jsx';
import { sheetGrid } from '../../src/components/PrintPreview.jsx';
import { eq, deepEq } from '../assert.js';

export const title = '인쇄';

export default async function suite(test) {
  await test('기본 인쇄 옵션은 한 부, 컬러, 세로, 100%다', () => {
    eq(DEFAULT_PRINT_OPTIONS.copies, 1);
    eq(DEFAULT_PRINT_OPTIONS.collate, true);
    eq(DEFAULT_PRINT_OPTIONS.color, true);
    eq(DEFAULT_PRINT_OPTIONS.duplexMode, 'simplex');
    eq(DEFAULT_PRINT_OPTIONS.landscape, false);
    eq(DEFAULT_PRINT_OPTIONS.scaleFactor, 100);
    eq(DEFAULT_PRINT_OPTIONS.pagesPerSheet, 1);
    eq(DEFAULT_PRINT_OPTIONS.silent, false);
    eq(DEFAULT_PRINT_OPTIONS.deviceName, '');
  });

  await test('페이지 범위는 쉼표, 하이픈, 물결표를 읽고 문서 길이에 맞춘다', () => {
    deepEq(parsePageRange('1,3,5-8', 10), [1, 3, 5, 6, 7, 8]);
    deepEq(parsePageRange('2~4', 10), [2, 3, 4]);
    deepEq(parsePageRange('1, 3', 10), [1, 3]);
    deepEq(parsePageRange('1,1,2', 10), [1, 2]);
    deepEq(parsePageRange('1-100', 3), [1, 2, 3]);
    deepEq(parsePageRange('3', 2), []);
    deepEq(parsePageRange('5-2', 10), []);
    deepEq(parsePageRange('a', 10), []);
    deepEq(parsePageRange('1,a', 10), []);
    deepEq(parsePageRange('0', 10), []);
    deepEq(parsePageRange('', 10), []);
    deepEq(parsePageRange('  ', 10), []);
  });

  await test('모아 찍기 격자는 장당 페이지 수와 방향을 따른다', () => {
    deepEq(sheetGrid(1, false), { cols: 1, rows: 1 });
    deepEq(sheetGrid(0, false), { cols: 1, rows: 1 });
    deepEq(sheetGrid(2, false), { cols: 2, rows: 1 });
    deepEq(sheetGrid(2, true), { cols: 1, rows: 2 });
    deepEq(sheetGrid(4, false), { cols: 2, rows: 2 });
    deepEq(sheetGrid(6, false), { cols: 3, rows: 2 });
    deepEq(sheetGrid(6, true), { cols: 2, rows: 3 });
    deepEq(sheetGrid(9, false), { cols: 3, rows: 3 });
    deepEq(sheetGrid(16, true), { cols: 4, rows: 4 });
  });
}
