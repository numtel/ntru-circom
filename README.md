# ntru-circom

**This project has not been audited and should not be used in production.**

NTRU (post-quantum asymmetric lattice) encryption in Javascript and Circom

Supports large keys and [additive homomorphism](test/reference.test.js#L47)

## Installation

> [!IMPORTANT]
> Requires Node.js and Circom installed (if using circuits)

```sh
$ git clone https://github.com/numtel/ntru-circom.git
$ cd ntru-circom
$ npm install
$ npm test

# Run medium sized tests and output circom compilation details
$ GO_167=1 VERBOSE=1 npm test -- -f "decryption #2"
$ GO_167=1 VERBOSE=1 npm test -- -f "encryption #2"
$ GO_167=1 VERBOSE=1 npm test -- -f "together #2"

# Run large tests and output circom compilation details
$ GO_LARGE=1 VERBOSE=1 npm test -- -f "decryption #1"
$ GO_LARGE=1 VERBOSE=1 npm test -- -f "encryption #1"
$ GO_LARGE=1 VERBOSE=1 npm test -- -f "together #1"
```

## Recommended parameters

> [!CAUTION]
> Default settings are not high security!

Description | 	N  |	q  | 	p
-----------|-----------|---|---------
Default | 167 | 128 | 3
128 bit security margin (NTRU-HPS) |	509 | 	2048 |	3
192 bit security margin (NTRU-HPS) |	677 |	2048 |	3
256 bit security margin (NTRU-HPS) |	821 |	4096 | 	3
256 bit security margin (NTRU-HRSS) | 	701 | 8192 |	3

Source: [Wikipedia](https://en.wikipedia.org/wiki/NTRUEncrypt#Table_1:_Parameters)

> [!TIP]
>
> The [Choosing Parameters for NTRUEncrypt paper](https://jmschanck.info/papers/20150718-ntruparams.pdf) suggests using ~`N/3` for `df`, `dg`, `dr` parameters.

## Javascript implementation

```js
import NTRU from 'ntru-circom';

// Encrypt plaintext values up to N (default 167) bits long
const inputStr = 'Hello World';

const ntru = new NTRU;

// Generate a new private key
ntru.generatePrivateKeyF();
// Generate a new public key
ntru.generateNewPublicKeyGH();

// Encrypt the string
const encrypted = ntru.encryptStr(inputStr);

// Decryption returns original value
if(ntru.decryptStr(encrypted) !== inputStr) throw new Error;
```

### `constructor(options)`

* `options` `<Object>`
  * `N` `<Number>` Coefficient count (Default: 167)
  * `p` `<Number>` Small prime field (Never changes, default: 3)
  * `q` `<Number>` Main field size (Power of 2, default: 128)
  * `df` `<Number>` Count of each non-zero (1,-1) coefficients in F (private key complexity)
  * `dg` `<Number>` Count of each non-zero (1,-1) coefficients in G (public key generation salt secret)
  * `dr` `<Number>` Count of each non-zero (1,-1) coefficients in randomness during encryption
  * `h` `<Number[N]>` Optional, specify a public key for encryptions

### `loadPrivateKey(fArr)`

* `fArr` `<Number[N]>` Array of trinary coefficients (0, 1, -1) (Must be invertible mod q and p)

Load a specific private key. Sets `f`, `fp`, `fq` instance properties.

### `generatePrivateKeyF()`

Generate a new private key. Sets `f`, `fp`, `fq` instance properties.

### `generatePublicKeyGH()`

Generate a new public key. Sets `g`, `h` instance properties.

### `generatePublicKeyH()`

Generate a new public key using a specific generation secret. Sets `h` instance property.

### `encryptStr(inputPlain)`

* `inputPlain` `<String>` Text to be encrypted using public key `h`

Returns `<Number[N] mod q>` ciphertext array of values.

### `decryptStr(encrypted)`

* `encrypted` `<Number[N] mod q>` Ciphertext array of values

Returns `<String>` plaintext

### `encryptBits(m)`

* `m` `<Number[N]>` Plaintext array of trinary coefficients (0, 1, 2) up to `N` length

Returns object:

```
{
  value: <Number[N] mod q>,
  // Inputs for VerifyEncrypt circuit witness
  input: {
    r, // randomness
    m, // plaintext
    h, // public key
    quotientE, // verify final step
    remainderE, // encrypted ciphertext
  },
  // Parameters for VerifyEncrypt circuit compilation
  params: {q, nq, N},
}
```

### `decryptBits(e)`

* `e` `<Number[N]>` Ciphertext array of coefficients

Returns object:

```
{
  value: <Number[N] mod p>,
  // Inputs for VerifyDecrypt circuit witness
  input: {
    f, // private key
    fp, // inverse of private key mod p
    e, // encrypted ciphertext
    quotient1, // verify intermediate step
    remainder1, // verify intermediate
    quotient2, // verify final step
    remainder2, // decrypted plaintext
  },
  // Parameters for VerifyDecrypt circuit compilation
  params: {q, nq, p, np, N},
}
```

### `verifyKeysInputs()`

Generate the inputs and parameters for creating a `VerifyInverse` proof to prove coherency of a private key or that the public key matches the private key.

Three cases are keys in the return object:

Case | Usage
-----|-----------
`fp` | Use this to verify `fp` is derived from `f`, confirming a decryption
`fq` | Use this as a first step if verifying `h` is derived from `f` in order to prove the user knows the private key for an encryption
`h`  | Use this as a second step to verifying the public key

> [!TIP]
> In addition to verifying private key coherency (case `fp`), it is recommended to pad the message with data that can be confirmed during decryption.

### Library functions

```js
import {
    // general polynomial operations
    degree, // compute degree of polynomial
    trimPolynomial, // trim leading zeros from polynomial
    modInverse, // compute multiplicative inverse mod p
    addPolynomials,
    subtractPolynomials,
    multiplyPolynomials,
    dividePolynomials,
    multiplyPolynomialsByScalar,

    // for inverting polynomials
    extendedEuclidianAlgorithm,
    polyInv,

    // create a random array of given length with set number of 1, -1 values
    generateCustomArray,

    expandArrayToMultiple,
    expandArray,

    // format helpers
    stringToBits,
    bitsToString,
    bigintToBits,
    bitsToBigInt,

    packOutput, // helper for invoking CombineArray template
    unpackInput, // helper for invoking UnpackArray template
} from 'ntru-circom';
```

## Circom Templates

```circom
include "ntru-circom/circuits/ntru.circom";
```

### `VerifyEncrypt`

Verifies that a ciphertext matches a given plaintext, publickey, and randomness.

### `VerifyDecrypt`

Verifies that a plaintext matches a given ciphertext and privatekey.

### `VerifyInverse`

Verify that the private key is coherent (`f` matches `fp` or `fq`) or that the public key is derived from a specific private key (`h` matches `fq` and `g`).

### `CombineArray`/`UnpackArray`

For importing or exporting data with fewer signals

## References

* [NTRUEncrypt on Wikipedia](https://en.wikipedia.org/wiki/NTRUEncrypt)
* [pointedsphere/NTRU_python](https://github.com/pointedsphere/NTRU_python)
* [Choosing Parameters for NTRUEncrypt](https://jmschanck.info/papers/20150718-ntruparams.pdf)
* [A Chosen-Ciphertext Attack against NTRU](https://www.iacr.org/archive/crypto2000/18800021/18800021.pdf)

## License

MIT
