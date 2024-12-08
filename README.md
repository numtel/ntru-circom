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

## Javascript class NTRU

> [!CAUTION]
> Default settings are not high security!
>
> `N=701`, `q=8192` recommended for 256-bit equivalent security.

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
if(ntru.decryptStr(encrypted) !== inputStr) throw new Error();
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
  // Parameters for VerifyDecrypt/VerifyEncryptAndDecrypt circuit compilation
  params: {q, nq, p, np, N},
}
```

## Circom Templates

```circom
include "ntru-circom/circuits/ntru.circom";
```

### `VerifyEncrypt`

Verifies that a ciphertext matches a given plaintext, publickey, and randomness.

### `VerifyDecrypt`

Verifies that a plaintext matches a given ciphertext and privatekey.

### `VerifyEncryptAndDecrypt`

Verifies an encryption and decryption of the same plaintext/ciphertext in order to ensure that the user knows the private key to the message they are encrypting.

Verifying both operations together like this is much less computation than the straightforward approach of deriving the public key from the private key inside the circuit.

## References

* [https://en.wikipedia.org/wiki/NTRUEncrypt](https://en.wikipedia.org/wiki/NTRUEncrypt)
* [https://github.com/pointedsphere/NTRU_python](https://github.com/pointedsphere/NTRU_python)
* [https://jmschanck.info/papers/20150718-ntruparams.pdf](https://jmschanck.info/papers/20150718-ntruparams.pdf)

## License

MIT
