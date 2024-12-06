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

# Run large tests and output circom compilation details
$ GO_LARGE=1 VERBOSE=1 npm test -- -f "decryption #1"
$ GO_LARGE=1 VERBOSE=1 npm test -- -f "encryption #1"
```

## References

* [https://en.wikipedia.org/wiki/NTRUEncrypt](https://en.wikipedia.org/wiki/NTRUEncrypt)
* [https://github.com/pointedsphere/NTRU_python](https://github.com/pointedsphere/NTRU_python)
* [https://jmschanck.info/papers/20150718-ntruparams.pdf](https://jmschanck.info/papers/20150718-ntruparams.pdf)

## License

MIT
