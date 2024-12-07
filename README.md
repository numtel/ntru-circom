# ntru-circom

**This project has not been audited and should not be used in production.**

NTRU (post-quantum asymmetric lattice) encryption in Javascript and Circom

Supports large keys and additive homomorphism

## Installation

Requires Node.js, Circom installed

```sh
$ git clone https://github.com/numtel/ntru-circom.git
$ cd ntru-circom
$ npm install
$ npm test

# Run medium-sized tests and output circom compilation details
$ GO_167=1 VERBOSE=1 npm test -- -f "decryption #2"
$ GO_167=1 VERBOSE=1 npm test -- -f "encryption #2"
$ GO_167=1 VERBOSE=1 npm test -- -f "together #2"

# Run large tests and output circom compilation details
$ GO_LARGE=1 VERBOSE=1 npm test -- -f "decryption #1"
$ GO_LARGE=1 VERBOSE=1 npm test -- -f "encryption #1"
$ GO_LARGE=1 VERBOSE=1 npm test -- -f "together #1"
```

## References

* [https://en.wikipedia.org/wiki/NTRUEncrypt](https://en.wikipedia.org/wiki/NTRUEncrypt)
* [https://github.com/pointedsphere/NTRU_python](https://github.com/pointedsphere/NTRU_python)
* [https://jmschanck.info/papers/20150718-ntruparams.pdf](https://jmschanck.info/papers/20150718-ntruparams.pdf)

## License

GPL-v3
