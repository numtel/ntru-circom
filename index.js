// NTRU encryption algorithm
// https://en.wikipedia.org/wiki/NTRUEncrypt
// Ported from https://github.com/pointedsphere/NTRU_python
// By numtel <ben@latenightsketches.com>
// License: MIT

export default class NTRU {
  constructor(options) {
    Object.assign(this, {
      // See https://en.wikipedia.org/wiki/NTRUEncrypt#Table_1:_Parameters
      // And https://jmschanck.info/papers/20150718-ntruparams.pdf
      N: 167, // number of coefficients in scheme
      p: 3, // small prime field (never changes)
      q: 128, // main field size (power of 2)
      df: 61, // number of 1s/-1s in f during generation (private key)
      dg: 20, // number of 1s/-1s in g during generation (public key generation salt secret)
      dr: 18, // number of 1s/-1s in randomness during encryption
      f: null, // private key, coefficient array of size N
      fp: null, // f^-1 mod p
      fq: null, // f^-1 mod q
      g: null, // public key generation secret
      h: null, // public key
    }, options);

    this.I = (new Array(this.N + 1)).fill(0);
    this.I[0] = 1;
    this.I[this.I.length - 1] = -1;
  }
  // Load a specific private key
  loadPrivateKeyF(fArr) {
    const {p, q} = this;

    this.f = fArr;
    this.fq = polyInv(this.f, this.I, this.q);
    this.fp = polyInv(this.f, this.I, this.p);

    // check if fp,fq match f like verifyKeysInputs
    const fmodq = this.f.map(x=>x=== -1 ? q-1 : x);
    const fmodp = this.f.map(x=>x=== -1 ? p-1 : x);

    const fqDiv = dividePolynomials(multiplyPolynomials(this.fq, fmodq, q), this.I, q);
    if(fqDiv.remainder.length !== 1 && fqDiv.remainder[0] !== 1)
      throw new Error('invalid fq');
    const fpDiv = dividePolynomials(multiplyPolynomials(this.fp, fmodp, p), this.I, p);
    if(fpDiv.remainder.length !== 1 && fpDiv.remainder[0] !== 1)
      throw new Error('invalid fp');

    return true;
  }
  // Generate a new private key
  generatePrivateKeyF() {
    const maxTries = 100;
    let i = 0;
    let retval;
    while((!retval || !(this.fq && this.fp)) && i++ < maxTries) {
      try {
        retval = this.loadPrivateKeyF(generateCustomArray(this.N, this.df, this.df - 1));
      } catch(error) {
        // no-op
      }
    }
    if(!this.fq || !this.fp) {
      throw new Error('Could not find invertible f');
    }
  }
  // Generate a new public key
  generateNewPublicKeyGH() {
    this.g = generateCustomArray(this.N, this.dg, this.dg);
    this.generatePublicKeyH();
  }
  // Generate a public key given a specific generation secret
  generatePublicKeyH() {
    if(!this.f) throw new Error('missing private key F');
    if(!this.g) throw new Error('missing private key G');
    const pFq =  multiplyPolynomialsByScalar(this.fq, this.p, this.q);
    const pFqG = multiplyPolynomials(pFq, this.g, this.q);
    const {remainder} = dividePolynomials(pFqG, this.I, this.q);
    this.h = trimPolynomial(remainder);
  }
  encryptStr(inputPlain) {
    // Max N bits since there's no provision to split into words
    return this.encryptBits(stringToBits(inputPlain)).value;
  }
  decryptStr(encrypted) {
    return bitsToString(expandArrayToMultiple(this.decryptBits(encrypted).value, 8));
  }
  encryptBits(m) {
    // Transform negative values since the circuit doesn't handle them
    const r = generateCustomArray(this.N, this.dr, this.dr).map(x=>x=== -1 ? this.p-1 : x);
    const rhq =  multiplyPolynomials(r, this.h, this.q);
    const rhqm = addPolynomials(m, rhq, this.q);
    const {quotient, remainder} = dividePolynomials(rhqm, this.I, this.q);
    const encrypted = trimPolynomial(remainder);
    return {
      value: encrypted,
      inputs: {
        r,
        m: expandArray(m, this.N, 0),
        h: expandArray(this.h, this.N, 0),
        // Transform values to be within the field
        quotientE: expandArray(quotient.map(x => x % this.q), this.N+1, 0),
        remainderE: expandArray(remainder, this.N+1, 0),
      },
      params: [
        this.q,
        this.calculateNq(),
        this.N,
      ],
    };
  }
  decryptBits(e) {
    const f = this.f.map(x=>x=== -1 ? this.q-1 : x);
    const a = multiplyPolynomials(f, e, this.q);
    const aDiv = dividePolynomials(a, this.I, this.q);
    // This 'off-by-one' somehow fixes the value so it can calculate in circom
    // the same way without needing to use negative numbers
    const aDivP = aDiv.remainder.map(x => x > this.q/2 ? (x+1)%this.p : x%this.p);
    const c = multiplyPolynomials(this.fp, aDivP, this.p);
    const cDiv = dividePolynomials(c, this.I, this.p);
    const decrypted = trimPolynomial(cDiv.remainder);
    return {
      value: decrypted,
      inputs: {
        f: expandArray(f, this.N, 0),
        fp: expandArray(this.fp, this.N, 0),
        e: expandArray(e, this.N, 0),
        quotient1: expandArray(aDiv.quotient, this.N + 1, 0),
        remainder1: expandArray(aDiv.remainder, this.N + 1, 0),
        quotient2: expandArray(cDiv.quotient, this.N + 1, 0),
        remainder2: expandArray(cDiv.remainder, this.N + 1, 0),
      },
      params: [
        this.q,
        this.calculateNq(),
        this.p,
        this.calculateNp(),
        this.N,
      ],
    };
  }
  verifyKeysInputs() {
    if(!this.f) throw new Error('missing private key F');
    if(!this.fq) throw new Error('missing private key Fq');
    if(!this.fp) throw new Error('missing private key Fp');
    if(!this.g) throw new Error('missing private key G');
    if(!this.h) throw new Error('missing public key H');
    const q = this.q;
    const nq = this.calculateNq();
    const p = this.p;
    const np = this.calculateNp();
    const fmodq = this.f.map(x=>x=== -1 ? q-1 : x);
    const fmodp = this.f.map(x=>x=== -1 ? p-1 : x);
    const fq = this.fq;
    const fp = this.fp;
    const fqp = fq.map(x=>x*p);
    const g = this.g.map(x=>x=== -1 ? q-1 : x);

    const fqDiv = dividePolynomials(multiplyPolynomials(fq, fmodq, q), this.I, q);
    if(fqDiv.remainder.length !== 1 && fqDiv.remainder[0] !== 1)
      throw new Error('invalid fq');
    const fpDiv = dividePolynomials(multiplyPolynomials(fp, fmodp, p), this.I, p);
    if(fpDiv.remainder.length !== 1 && fpDiv.remainder[0] !== 1)
      throw new Error('invalid fp');
    const hDiv = dividePolynomials(multiplyPolynomials(fqp, g, q), this.I, q);
    if(this.h.reduce((out, cur, index) => out || hDiv.remainder[index] !== cur, false))
      throw new Error('invalid h');

    return {
      fq: {
        params: [q, nq, this.N],
        inputs: {
          f: expandArray(fmodq, this.N, 0),
          fq: expandArray(fq, this.N, 0),
          quotientI: expandArray(fqDiv.quotient, this.N+1, 0),
          remainderI: expandArray(fqDiv.remainder, this.N+1, 0),
        },
      },
      fp: {
        params: [p, np, this.N],
        inputs: {
          f: expandArray(fmodp, this.N, 0),
          fq: expandArray(fp, this.N, 0),
          quotientI: expandArray(fpDiv.quotient, this.N+1, 0),
          remainderI: expandArray(fpDiv.remainder, this.N+1, 0),
        },
      },
      h: {
        params: [q, nq, this.N],
        inputs: {
          f: expandArray(g, this.N, 0),
          fq: expandArray(fqp, this.N, 0),
          quotientI: expandArray(hDiv.quotient, this.N+1, 0),
          remainderI: expandArray(hDiv.remainder, this.N+1, 0),
        },
      },
    };
  }
  // Helpers that calculate the maximum value before modulus
  // See MultiplyPolynomials circom template comment
  // The middle coefficient has N items summed which will be at most q*q
  calculateNq() {
    return Math.ceil(Math.log2(this.q * this.q * this.N));
  }
  calculateNp() {
    return Math.ceil(Math.log2(this.p * this.p * this.N));
  }
}

// Function to compute the degree of a polynomial
export function degree(poly) {
  for (let i = poly.length - 1; i >= 0; i--) {
    if (poly[i] !== 0) return i;
  }
  return -1; // Degree of zero polynomial is -1
}

// Function to trim leading zeros from a polynomial
export function trimPolynomial(poly) {
  let d = degree(poly);
  return d >= 0 ? poly.slice(0, d + 1) : [0];
}

// Function to compute the multiplicative inverse modulo p
export function modInverse(a, p) {
  a = ((a % p) + p) % p;
  for (let x = 1; x < p; x++) {
    if ((a * x) % p === 1) {
      return x;
    }
  }
  return null; // No inverse exists
}

// Function to add two polynomials modulo p
export function addPolynomials(a, b, p) {
  const maxLength = Math.max(a.length, b.length);
  const result = [];
  for (let i = 0; i < maxLength; i++) {
    const coeffA = i < a.length ? a[i] : 0;
    const coeffB = i < b.length ? b[i] : 0;
    result[i] = ((coeffA + coeffB) % p + p) % p;
  }
  return trimPolynomial(result);
}

// Function to subtract two polynomials modulo p
export function subtractPolynomials(a, b, p) {
  const maxLength = Math.max(a.length, b.length);
  const result = [];
  for (let i = 0; i < maxLength; i++) {
    const coeffA = i < a.length ? a[i] : 0;
    const coeffB = i < b.length ? b[i] : 0;
    result[i] = ((coeffA - coeffB) % p + p) % p;
  }
  return trimPolynomial(result);
}

// Complex number helper functions.
function addComplex(a, b) {
  return { re: a.re + b.re, im: a.im + b.im };
}

function subtractComplex(a, b) {
  return { re: a.re - b.re, im: a.im - b.im };
}

function multiplyComplex(a, b) {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

// FFT implementation.
// The array `a` is modified in place.
// If invert === true, computes the inverse FFT.
function fft(a, invert) {
  const n = a.length;

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j -= bit;
    }
    j += bit;
    if (i < j) {
      const temp = a[i];
      a[i] = a[j];
      a[j] = temp;
    }
  }

  // Cooley–Tukey FFT.
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (2 * Math.PI / len) * (invert ? -1 : 1);
    const wlen = { re: Math.cos(angle), im: Math.sin(angle) };
    for (let i = 0; i < n; i += len) {
      let w = { re: 1, im: 0 };
      for (let j = 0; j < len / 2; j++) {
        const u = a[i + j];
        const v = multiplyComplex(a[i + j + len / 2], w);
        a[i + j] = addComplex(u, v);
        a[i + j + len / 2] = subtractComplex(u, v);
        w = multiplyComplex(w, wlen);
      }
    }
  }

  if (invert) {
    for (let i = 0; i < n; i++) {
      a[i].re /= n;
      a[i].im /= n;
    }
  }
}

// Multiplies two polynomials a and b modulo p using FFT
export function multiplyPolynomials(a, b, p) {
  if (a.length === 0 || b.length === 0) return [0];

  // Determine the size for FFT (next power of 2 >= a.length + b.length - 1).
  let n = 1;
  while (n < a.length + b.length - 1) n <<= 1;

  // Initialize complex arrays for a and b.
  const A = new Array(n);
  const B = new Array(n);
  for (let i = 0; i < n; i++) {
    A[i] = { re: i < a.length ? a[i] : 0, im: 0 };
    B[i] = { re: i < b.length ? b[i] : 0, im: 0 };
  }

  // Compute FFT on both arrays.
  fft(A, false);
  fft(B, false);

  // Pointwise multiplication.
  for (let i = 0; i < n; i++) {
    A[i] = multiplyComplex(A[i], B[i]);
  }

  // Inverse FFT to get the convolved coefficients.
  fft(A, true);

  // Build the result polynomial, reducing each coefficient modulo p.
  const resultLength = a.length + b.length - 1;
  const result = new Array(resultLength);
  for (let i = 0; i < resultLength; i++) {
    // Rounding is needed because of floating-point imprecision.
    result[i] = ((Math.round(A[i].re)) % p + p) % p;
  }

  return trimPolynomial(result);
}

// Function to divide two polynomials modulo p
export function dividePolynomials(a, b, p) {
  if (degree(b) === -1) {
    throw new Error("Cannot divide by zero polynomial.");
  }

  // Make a copy of the dividend.
  let dividend = a.slice();
  const divisor = b.slice();
  const degDivisor = degree(divisor);

  // Initialize quotient with the maximum possible size.
  const quotient = new Array(Math.max(0, degree(a) - degDivisor + 1)).fill(0);

  // Perform long division.
  while (degree(dividend) >= degDivisor) {
    const degDividend = degree(dividend);
    const leadDividend = dividend[degDividend];
    const leadDivisor = divisor[degDivisor];
    const invLeadDivisor = modInverse(leadDivisor, p);
    if (invLeadDivisor === null) {
      throw new Error("No inverse exists for division.");
    }

    // Compute the coefficient for the term corresponding to x^(degDividend - degDivisor).
    const coeff = (leadDividend * invLeadDivisor) % p;
    const degDiff = degDividend - degDivisor;
    quotient[degDiff] = coeff;

    // Subtract coeff * x^(degDiff) * divisor from dividend.
    for (let i = 0; i <= degDivisor; i++) {
      const index = i + degDiff;
      // Ensure that dividend[index] exists; if not, treat it as 0.
      dividend[index] = ((dividend[index] || 0) - coeff * divisor[i]) % p;
      if (dividend[index] < 0) {
        dividend[index] += p;
      }
    }
  }

  return {
    quotient: trimPolynomial(quotient),
    remainder: trimPolynomial(dividend)
  };
}

// Function to multiply a polynomial by a scalar modulo p
export function multiplyPolynomialsByScalar(poly, scalar, p) {
  return poly.map(coeff => (coeff * scalar) % p);
}

// Extended Euclidean Algorithm for polynomials modulo p
// Example usage
// From https://stackoverflow.com/questions/52654760/find-the-inverse-reciprocal-of-a-polynomial-modulo-another-polynomial-with-coe
// For example, let's invert 3x^3+2x+4 modulo x^2+2x+3 with the coefficient field Z/11Z:

// const a = [4,2,0,3];
// const b = [3,2,1];
// const c = extendedEuclideanAlgorithm(a, b, 11);
// console.log(c);

// This prints [5, 8] - the inverse is 8x+5. Sanity check by hand:
// 
// (3x^3+2x+4)*(8x+5) = 24x^4 + 15x^3 + 16x^2 + 42x + 20
//                    = 2x^4 + 4x^3 + 5x^2 + 9x + 9
//                    = (x^2 + 2x + 3)*(2x^2 - 1) + 1
//                    = 1 mod q
// 
export function extendedEuclideanAlgorithm(a, b, p) {
  let r0 = a.slice();
  let r1 = b.slice();
  let s0 = [1];
  let s1 = [0];

  while (degree(r1) >= 0) {
    const { quotient, remainder } = dividePolynomials(r0, r1, p);
    const tempR = r1;
    r1 = remainder;
    r0 = tempR;

    const tempS = s1;
    s1 = subtractPolynomials(s0, multiplyPolynomials(quotient, s1, p), p);
    s0 = tempS;
  }

  // Normalize
  const leadCoeff = r0[degree(r0)];
  const invLeadCoeff = modInverse(leadCoeff, p);
  if (invLeadCoeff !== null && invLeadCoeff !== 1) {
    r0 = multiplyPolynomialsByScalar(r0, invLeadCoeff, p);
    s0 = multiplyPolynomialsByScalar(s0, invLeadCoeff, p);
  }

  // gcd must be 1
  if(r0.length !== 1 && r0[0] !== 1) {
    throw new Error('invalid_gcd');
  }

  return {
    gcd: r0,
    inverse: s0
  };
}

export function generateCustomArray(length, numOnes, numNegOnes) {
  if (numOnes + numNegOnes > length) {
    throw new Error("The total of 1s and -1s cannot exceed the array length.");
  }

  // Create an array filled with 0s
  const array = new Array(length).fill(0);

  // Add 1s to the array
  for (let i = 0; i < numOnes; i++) {
    array[i] = 1;
  }

  // Add -1s to the array
  for (let i = numOnes; i < numOnes + numNegOnes; i++) {
    array[i] = -1;
  }

  // Shuffle the array to randomize the positions of 1s, -1s, and 0s
  for (let i = array.length - 1; i > 0; i--) {
    const uintArray = new Uint32Array(1);
    crypto.getRandomValues(uintArray);
    const j = uintArray[0] % (i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}

// Invert a polynomial
export function polyInv(polyIn, polyI, polyMod) {
  const exponent = Math.log2(polyMod);
  // If the modulus is a power of 2, use Galois towers
  if (Math.round(exponent) === exponent) {
    // Perform iterative refinement for powers of 2
    let inverse = extendedEuclideanAlgorithm(polyIn, polyI, 2).inverse;

    for (let a = 1; a < exponent; a++) {
      const twiceInverse = multiplyPolynomialsByScalar(inverse, 2, polyMod);
      const polyTimesSquareInverse = multiplyPolynomials(polyIn, multiplyPolynomials(inverse, inverse, polyMod), polyMod);
      let updatedInverse = subtractPolynomials(twiceInverse, polyTimesSquareInverse, polyMod);

      // Reduce updated inverse modulo modulusPolynomial
      const { remainder } = dividePolynomials(updatedInverse, polyI, polyMod);
      inverse = trimPolynomial(remainder);
    }

    return inverse;
  } else {
    // p is a prime
    const inv = extendedEuclideanAlgorithm(polyIn, polyI, polyMod);
    return inv.inverse;
  }
}

export function expandArrayToMultiple(array, multiple) {
  if (!Array.isArray(array)) {
    throw new Error("First argument must be an array.");
  }
  if (typeof multiple !== "number" || multiple <= 0 || !Number.isInteger(multiple)) {
    throw new Error("Multiple must be a positive integer.");
  }

  const currentLength = array.length;
  const targetLength = Math.ceil(currentLength / multiple) * multiple;

  while (array.length < targetLength) {
    array.push(0);
  }

  return array;
}

export function expandArray(arr, len, fill) {
  return [...arr, ...Array(len - arr.length).fill(fill)];
}

export function stringToBits(str) {
  let bitsArray = [];
  for (let i = 0; i < str.length; i++) {
    let charCode = str.charCodeAt(i);
    let binaryString = charCode.toString(2).padStart(8, '0');
    bitsArray.push(...binaryString.split('').map(Number));
  }
  return bitsArray;
}

export function bitsToString(bitsArray) {
  let str = '';
  for (let i = 0; i < bitsArray.length; i += 8) {
    let byte = bitsArray.slice(i, i + 8);
    let charCode = parseInt(byte.join(''), 2);
    str += String.fromCharCode(charCode);
  }
  return str;
}

export function bigintToBits(bigint) {
  const bits = [];
  // While the number is not zero, extract the least significant bit (LSB) and shift right
  while (bigint > 0n) {
      bits.push(Number(bigint & 1n)); // Get the LSB (0 or 1)
      bigint >>= 1n; // Shift right by 1 bit
  }
  return bits;
}

export function bitsToBigInt(bits) {
  return BigInt(`0b${bits.join('')}`);
}

export function packOutput(maxVal, dataLen, data) {
  const maxInputBits = Math.floor(Math.log2(maxVal) + 1);
  const numInputsPerOutput = Math.floor(252 / maxInputBits);
  const arrLen = Math.max(
    Math.ceil(dataLen / numInputsPerOutput) * numInputsPerOutput,
    numInputsPerOutput * 3, // need min of 3 output field elements
  );
  const maxOutputBits = numInputsPerOutput * maxInputBits;
  const outputSize = Math.max(Math.ceil(arrLen / numInputsPerOutput), 3); // need min of 3 for burn details
  const inArr = expandArray(data, arrLen, 0);

  const expected = new Array(outputSize).fill(0n);
  for (let i = 0; i < inArr.length; i++) {
    const outIdx = Math.floor(i / numInputsPerOutput);
    expected[outIdx] += BigInt(inArr[i]) << BigInt((i % numInputsPerOutput) * maxInputBits);
  }

  return {
    maxInputBits,
    maxOutputBits,
    outputSize,
    arrLen,
    expected,
  };
}

export function unpackInput(maxVal, packedBits, data) {
  const maxInputBits = Math.floor(Math.log2(maxVal) + 1);
  const numInputsPerOutput = Math.floor(packedBits / maxInputBits);
  const unpackedSize = numInputsPerOutput * data.length;
  const mask = (1n << BigInt(maxInputBits)) - 1n;

  const unpacked = new Array(unpackedSize).fill(0);
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < numInputsPerOutput; j++) {
      const shift = BigInt(j * maxInputBits);
      const chunk = (data[i] >> shift) & mask;
      unpacked[i * numInputsPerOutput + j] = Number(chunk);
    }
  }

  return {
    maxInputBits,
    packedBits,
    packedSize: data.length,
    unpackedSize,
    unpacked: trimPolynomial(unpacked),
  };
}
