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
    this.f = fArr;
    this.fq = polyInv(this.f, this.I, this.q);
    this.fp = polyInv(this.f, this.I, this.p);
  }
  // Generate a new private key
  generatePrivateKeyF() {
    // XXX: Large keys can take a long time to find an invertible f
    const maxTries = 100000000;
    let i = 0;
    while(!(this.fq && this.fp) && i++ < maxTries) {
      try {
        this.loadPrivateKeyF(generateCustomArray(this.N, this.df, this.df - 1));
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
    this.generatePublicKeyH(generateCustomArray(this.N, this.dg, this.dg));
  }
  // Generate a public key given a specific generation secret
  generatePublicKeyH(gArr) {
    if(!this.f) throw new Error('missing private key F');
    this.g = gArr;
    this.h = genH(this.p, this.q, this.fq, this.g, this.I);
  }
  encryptStr(inputPlain) {
    // Max N bits since there's no provision to split into words
    return this.encryptBits(stringToBits(inputPlain));
  }
  decryptStr(encrypted) {
    return bitsToString(expandArrayToMultiple(this.decryptBits(encrypted), 8));
  }
  encryptBits(m) {
    const r = generateCustomArray(this.N, this.dr, this.dr);
    return encrypt(r, m, this.h, this.q, this.I);
  }
  decryptBits(e) {
    return decrypt(this.f, e, this.I, this.q, this.p, this.fp);
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

// Function to multiply two polynomials modulo p
export function multiplyPolynomials(a, b, p) {
  if (a.length === 0 || b.length === 0) return [0];
  const result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      result[i + j] = result[i + j] + a[i] * b[j];
    }
  }
  return trimPolynomial(result.map(x=> x % p));
}

// Function to divide two polynomials modulo p
export function dividePolynomials(a, b, p) {
  if (degree(b) === -1) {
    throw new Error("Cannot divide by zero polynomial.");
  }
  let dividend = a.slice();
  const divisor = b.slice();
  let degDividend = degree(dividend);
  const degDivisor = degree(divisor);
  const resultSize = degDividend - degDivisor + 1;
  const result = new Array(resultSize < 0 ? 0 : resultSize).fill(0);

  while (degDividend >= degDivisor && degDividend >= 0) {
    const degDiff = degDividend - degDivisor;
    const leadCoeffDividend = dividend[degDividend];
    const leadCoeffDivisor = divisor[degDivisor];
    const invLeadCoeffDivisor = modInverse(leadCoeffDivisor, p);

    if (invLeadCoeffDivisor === null) {
      throw new Error("No inverse exists for division.");
    }

    const coeff = (leadCoeffDividend * invLeadCoeffDivisor) % p;
    result[degDiff] = coeff;

    const term = new Array(degDiff + 1).fill(0);
    term[degDiff] = coeff;

    const subtractTerm = multiplyPolynomials(divisor, term, p);
    dividend = subtractPolynomials(dividend, subtractTerm, p);
    degDividend = degree(dividend);
  }

  return {
    quotient: trimPolynomial(result),
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
function extendedEuclideanAlgorithm(a, b, p) {
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
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}

// Invert a polynomial
function polyInv(polyIn, polyI, polyMod) {
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

// Generate public key
function genH(p, q, fq, g, I) {
  const pFq =  multiplyPolynomialsByScalar(fq, p, q);
  const pFqG = multiplyPolynomials(pFq, g, q);
  const {remainder} = dividePolynomials(pFqG, I, q);
  return trimPolynomial(remainder);
}

export function encrypt(r, m, h, q, I) {
  const rhq =  multiplyPolynomials(r, h, q);
  const rhqm = addPolynomials(m, rhq, q);
  const {remainder} = dividePolynomials(rhqm, I, q);
  return trimPolynomial(remainder);
}

export function decrypt(f, e, I, q, p, fp) {
  const a = multiplyPolynomials(f, e, q);
  // This 'off-by-one' somehow fixes the value so it can calculate in circom
  // the same way without needing to use negative numbers
  const aDiv = dividePolynomials(a, I, q).remainder.map(x => (x > q/2 ? x + 1 : x) % p);
  const c = multiplyPolynomials(fp, aDiv, p);
  const cDiv = dividePolynomials(c, I, p);
  return trimPolynomial(cDiv.remainder);
}

function expandArrayToMultiple(array, multiple) {
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

function stringToBits(str) {
  let bitsArray = [];
  for (let i = 0; i < str.length; i++) {
    let charCode = str.charCodeAt(i);
    let binaryString = charCode.toString(2).padStart(8, '0');
    bitsArray.push(...binaryString.split('').map(Number));
  }
  return bitsArray;
}

function bitsToString(bitsArray) {
  let str = '';
  for (let i = 0; i < bitsArray.length; i += 8) {
    let byte = bitsArray.slice(i, i + 8);
    let charCode = parseInt(byte.join(''), 2);
    str += String.fromCharCode(charCode);
  }
  return str;
}
