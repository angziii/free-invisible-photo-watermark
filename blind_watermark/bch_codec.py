#!/usr/bin/env python3
# coding=utf-8
"""
BCH error correction codec.
Pure Python implementation.
"""

import numpy as np

N = 31
K = 16
T = 3

# GF(2^5) with primitive polynomial x^5 + x^2 + 1
PRIM = 0x25
GF_SIZE = 32

gf_exp = [0] * (GF_SIZE * 2)
gf_log = [0] * GF_SIZE

x = 1
for i in range(GF_SIZE - 1):
    gf_exp[i] = x
    gf_log[x] = i
    x <<= 1
    if x >= GF_SIZE:
        x ^= PRIM
for i in range(GF_SIZE - 1, GF_SIZE * 2):
    gf_exp[i] = gf_exp[i - (GF_SIZE - 1)]


def gf_mul(a, b):
    if a == 0 or b == 0:
        return 0
    return gf_exp[gf_log[a] + gf_log[b]]


def gf_pow(a, n):
    if a == 0:
        return 0
    return gf_exp[(gf_log[a] * n) % (GF_SIZE - 1)]


def gf_poly_mul(p, q):
    r = [0] * (len(p) + len(q) - 1)
    for i, pi in enumerate(p):
        if pi:
            for j, qj in enumerate(q):
                if qj:
                    r[i + j] ^= gf_mul(pi, qj)
    return r


def gf_poly_eval(poly, x):
    result = poly[0]
    for i in range(1, len(poly)):
        result = gf_mul(result, x) ^ poly[i]
    return result


def compute_generator_poly():
    """Compute BCH(31,16) generator polynomial.
    
    g(x) = LCM of minimal polynomials for alpha^1..alpha^6
    = (x^5+x^2+1)(x^5+x^4+x^3+x^2+1)(x^5+x^4+x^2+x+1)
    """
    # Minimal polynomial of alpha^1 (primitive polynomial)
    min1 = [1, 0, 0, 1, 0, 1]  # x^5 + x^2 + 1
    
    # Minimal polynomial of alpha^3 (conjugates: 3, 6, 12, 24, 17)
    min3 = [1]
    for i in [3, 6, 12, 24, 17]:
        min3 = gf_poly_mul(min3, [1, gf_exp[i]])
    
    # Minimal polynomial of alpha^5 (conjugates: 5, 10, 20, 9, 18)
    min5 = [1]
    for i in [5, 10, 20, 9, 18]:
        min5 = gf_poly_mul(min5, [1, gf_exp[i]])
    
    # g(x) = min1 * min3 * min5
    g = gf_poly_mul(min1, min3)
    g = gf_poly_mul(g, min5)
    return g


# Compute and cache generator polynomial
GEN_POLY = compute_generator_poly()


class BCHCodec:
    """BCH encoder/decoder."""

    def __init__(self, n=N, k=K, t=T):
        self.n = n
        self.k = k
        self.t = t
        self.gen = GEN_POLY

    def encode(self, data_bits):
        """Encode k data bits into n coded bits (systematic)."""
        data = [1 if b else 0 for b in data_bits]
        if len(data) < self.k:
            data = data + [0] * (self.k - len(data))
        elif len(data) > self.k:
            data = data[:self.k]

        # Multiply data polynomial by x^(n-k)
        msg = data + [0] * (self.n - self.k)

        # Polynomial division to get remainder
        remainder = msg[:]
        gen = self.gen
        for i in range(self.k):
            if remainder[i]:
                for j in range(len(gen)):
                    remainder[i + j] ^= gen[j]

        # Codeword = data || remainder (last n-k bits of msg after division)
        codeword = data + remainder[self.k:self.k + (self.n - self.k)]
        return [bool(b) for b in codeword]

    def decode(self, received_bits):
        """Decode n received bits, correct up to t errors."""
        r = [1 if b else 0 for b in received_bits]
        if len(r) < self.n:
            r = r + [0] * (self.n - len(r))

        # Compute syndrome
        syndrome = [gf_poly_eval(r, gf_exp[i]) for i in range(1, 2 * self.t + 1)]

        if all(s == 0 for s in syndrome):
            return [bool(b) for b in r[:self.k]], 0

        # Berlekamp-Massey
        sigma = self._berlekamp_massey(syndrome)
        if sigma is None:
            return [bool(b) for b in r[:self.k]], 0

        # Chien search
        error_pos = self._chien_search(sigma)
        if error_pos is None or len(error_pos) > self.t:
            return [bool(b) for b in r[:self.k]], 0

        for pos in error_pos:
            r[pos] ^= 1

        return [bool(b) for b in r[:self.k]], len(error_pos)

    def _berlekamp_massey(self, syndrome):
        C = [0] * (self.t + 1)
        B = [0] * (self.t + 1)
        C[0] = 1
        B[0] = 1
        L = 0
        m = 1
        b = 1

        for n in range(2 * self.t):
            d = syndrome[n]
            for i in range(1, min(L + 1, n + 1)):
                if 0 <= n - i < len(syndrome):
                    d ^= gf_mul(C[i], syndrome[n - i])

            if d == 0:
                m += 1
            else:
                T_poly = C[:]
                coeff = gf_mul(d, gf_pow(b, GF_SIZE - 2))
                for i in range(m, self.t + 1):
                    C[i] ^= gf_mul(coeff, B[i - m])
                if 2 * L <= n:
                    L = n + 1 - L
                    B = T_poly
                    b = d
                    m = 1
                else:
                    m += 1

        max_idx = -1
        for i in range(len(C) - 1, -1, -1):
            if C[i] != 0:
                max_idx = i
                break
        if max_idx < 0:
            return None
        return C[:max_idx + 1]

    def _chien_search(self, sigma):
        positions = []
        for i in range(self.n - 1, -1, -1):
            if gf_poly_eval(sigma, gf_exp[i]) == 0:
                positions.append(self.n - 1 - i)
        return positions if positions else None


def pad_and_encode(wm_bit, bch_codec):
    wm_size = len(wm_bit)
    k = bch_codec.k
    pad_len = (k - wm_size % k) % k
    padded = np.concatenate([np.asarray(wm_bit, dtype=bool), np.zeros(pad_len, dtype=bool)])

    encoded_blocks = []
    for i in range(0, len(padded), k):
        block = padded[i:i + k]
        encoded = bch_codec.encode(block)
        encoded_blocks.append(encoded)

    encoded_bits = np.concatenate([np.array(b, dtype=bool) for b in encoded_blocks])
    return encoded_bits, wm_size


def decode_and_unpad(encoded_bits, original_size, bch_codec):
    n = bch_codec.n
    decoded_blocks = []
    total_errors = 0
    for i in range(0, len(encoded_bits), n):
        block = encoded_bits[i:i + n]
        decoded, errors = bch_codec.decode(block)
        decoded_blocks.append(decoded)
        total_errors += errors

    decoded_bits = np.concatenate([np.array(b, dtype=bool) for b in decoded_blocks])
    return decoded_bits[:original_size], total_errors
