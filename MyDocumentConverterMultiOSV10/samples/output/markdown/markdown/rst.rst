===============================
My Document Converter 샘플 문서
===============================

:Author: SHKWON
:Date: 2026-09-22

===================
소개 (Introduction)
===================

이 문서는 **My Document Converter** 가 지원하는 모든 출력 형식의 샘플을 만드는 데 쓰이는 원본입니다.
*강조*, **굵게**, :strike:`취소선`, ``인라인 코드``, H:sub:`2`O 와 x:sup:`2`, 그리고
`링크 <https://example.com>`__를 담고 있습니다. This paragraph is in
English so that Latin-only formats still show something readable.

목록 (Lists)
------------

- 첫 번째 항목
- 두 번째 항목
  - 중첩된 항목
  - 또 하나의 중첩 항목
- 세 번째 항목

1. 순서가 있는 항목
2. 두 번째
3. 세 번째

- ☒ 끝난 일
- ☐ 남은 일

용어
   용어에 대한 정의입니다.

Pandoc
   범용 문서 변환기. 이 프로그램은 같은 형식 집합을 자체 엔진으로 다룹니다.

코드 (Code)
-----------

.. code-block:: js

   function greet(name) {
     console.log(`Hello, ${name}!`)
   }
   greet('world')

표 (Table)
----------

.. table:: 지원 형식의 일부

   +----------+--------+------+------+
   | 형식     | 확장자 | 읽기 | 쓰기 |
   +==========+========+======+======+
   | Markdown | .md    | O    | O    |
   +----------+--------+------+------+
   | HTML     | .html  | O    | O    |
   +----------+--------+------+------+
   | DOCX     | .docx  | O    | O    |
   +----------+--------+------+------+
   | EPUB     | .epub  | O    | O    |
   +----------+--------+------+------+

인용과 수식 (Quote and math)
----------------------------

   좋은 문서는 어떤 형식으로도 읽힙니다. — 누군가

인라인 수식 :math:`E = mc^2` 과 블록 수식:



.. math::

\int_0^1 x^2\,dx = \frac{1}{3}



각주와 그림 (Footnote and figure)
---------------------------------

각주가 붙은 문장입니다. [#]_ 자동 링크 https://pandoc.org 와
mailto:knix008@naver.com 도 있습니다.



.. image:: ../public/app-icon.svg
:alt: 프로그램 아이콘



--------------

마지막 문단입니다. 줄 끝에 두 칸을 두면
강제 줄바꿈이 됩니다.

.. [#] 각주의 내용입니다.
