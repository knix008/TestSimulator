"""Writes the MAT-files for the MATLAB tests: kinds.mat (level 5, every
variable kind, by scipy) and kinds73.mat (v7.3: HDF5 laid out the way MATLAB
does it, by h5py). Run: py -3 make_mat_fixtures.py (needs scipy and h5py)."""
import os

import h5py
import numpy as np
from scipy.io import savemat
from scipy.sparse import csc_matrix

HERE = os.path.dirname(os.path.abspath(__file__))


def path(name):
    return os.path.join(HERE, name)


# Level 5: char, cell, struct (array), sparse, complex, logical, int, 3-D.
cell = np.empty((1, 3), dtype=object)
cell[0, 0] = 1.5
cell[0, 1] = 'two'
cell[0, 2] = np.array([[1.0, 2.0, 3.0]])
people = np.zeros((1, 2), dtype=[('name', object), ('age', object)])
people[0, 0] = ('Ann', 31.0)
people[0, 1] = ('Bo', 47.0)
savemat(path('kinds.mat'), {
    'title': 'Bridge test',
    'c': cell,
    'p': people,
    'opts': {'tol': 1e-6, 'method': 'rk45'},
    'S': csc_matrix(np.array([[0, 0, 3.0], [4.0, 0, 0]])),
    'z': np.array([[1 + 2j, 3 - 1j]]),
    'ok': np.array([[True, False, True]]),
    'n8': np.array([[-3, 7]], dtype=np.int8),
    'cube': np.arange(24, dtype=float).reshape(2, 3, 4, order='F'),
}, do_compression=True)

# v7.3: MATLAB's HDF5 schema (column-major data stored with reversed dimensions).
f = h5py.File(path('kinds73.mat'), 'w', libver='earliest', userblock_size=512)


def cls(obj, name):
    obj.attrs.create('MATLAB_class', np.bytes_(name))


def matrix(parent, name, a, mclass='double', **kw):
    a = np.asarray(a)
    d = parent.create_dataset(name, data=a.T, **kw)
    cls(d, mclass)
    return d


def text(parent, name, s):
    d = parent.create_dataset(name, data=np.array([[ord(ch)] for ch in s], dtype=np.uint16))
    cls(d, 'char')
    d.attrs.create('MATLAB_int_decode', np.int32(2))
    return d


matrix(f, 'gain', np.array([[2.5]]))
matrix(f, 'M', np.arange(12, dtype=float).reshape(3, 4))
big = np.sin(np.linspace(0, 20, 5000)).reshape(1, -1)
matrix(f, 'wave', big, chunks=(1000, 1), compression='gzip', shuffle=True)
matrix(f, 'flags', np.array([[1, 0, 1]], dtype=np.uint8), 'logical')
matrix(f, 'i16', np.array([[-5, 6]], dtype=np.int16), 'int16')
cplx = np.zeros((1, 2), dtype=[('real', '<f8'), ('imag', '<f8')])
cplx['real'] = [[1.0, 3.0]]
cplx['imag'] = [[2.0, -1.0]]
d = f.create_dataset('z', data=cplx.T)
cls(d, 'double')
text(f, 'name', 'Hello')
refs = f.create_group('#refs#')
a = matrix(refs, 'a', np.array([[7.0]]))
b = text(refs, 'b', 'cell text')
cd = f.create_dataset('c', data=np.array([[a.ref], [b.ref]], dtype=h5py.ref_dtype))
cls(cd, 'cell')
g = f.create_group('opts')
cls(g, 'struct')
matrix(g, 'tol', np.array([[1e-6]]))
text(g, 'method', 'ode45')
e = f.create_dataset('empty', data=np.array([0, 0], dtype=np.uint64))
cls(e, 'double')
e.attrs.create('MATLAB_empty', np.uint8(1))
f.close()

header = b'MATLAB 7.3 MAT-file, Platform: GLNXA64, Created on: Mon Oct 26 12:00:00 2026 HDF5 schema 1.00 .'
header = header.ljust(116, b' ') + b'\0' * 8 + (0x0200).to_bytes(2, 'little') + b'IM'
with open(path('kinds73.mat'), 'r+b') as fh:
    fh.write(header.ljust(512, b'\0'))
print('wrote kinds.mat and kinds73.mat')
