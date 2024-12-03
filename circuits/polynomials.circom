pragma circom 2.1.0;

include "comparators.circom";

include "control-flow.circom";

// From https://web.archive.org/web/20221224004650/https://docs.electronlabs.org/reference/intro-to-circom#how-to-use-the-modulo-operator--in-circom
template Modulus(p, n) {
  signal input x;
  signal q;
  signal output y;

  y <-- x%p;
  q <-- x\p; //where '\' is the integer division operator
  x === q*p + y; //this works!
  // XXX: this final step is not necessary, adds a lot of constraints
//   component ltP = LessThan(n);
//   ltP.in[0] <== p;
//   ltP.in[1] <== y;
//   ltP.out === 0;
}

template MultiplyPolynomials(p, np, Na, Nb) {
  signal input a[Na];
  signal input b[Nb];
  signal output out[Na + Nb - 1];

  var buffer[Na + Nb - 1];
  for (var i = 0; i < Na; i++) {
    for (var j = 0; j < Nb; j++) {
      buffer[i + j] = Modulus(p, np)(buffer[i+j] + a[i] * b[j]);
    }
  }
  // TODO move the modulus to the end
  for (var k = 0; k < Na + Nb - 1; k++) {
    out[k] <== buffer[k];
  }
}

// Instead of doing all the work of calculating the division of the polynomials,
// just verify the calculation using multiplication
template VerifyDividePolynomials(p, np, Na, Nb, Nqr) {
  signal input a[Na]; // dividend
  signal input b[Nb]; // divisor
  signal input quotient[Nqr];
  signal input remainder[Nqr];

  var newSize = Nb + Nqr - 1;
  var product[newSize] = MultiplyPolynomials(p, np, Nb, Nqr)(b, quotient);
  for(var i = 0; i<Nqr; i++) {
    product[i] = Modulus(p, np)(product[i] + remainder[i]);
  }

  // product + remainder = dividend
  component eq[Na];
  for(var i = 0; i<Na; i++) {
    eq[i] = IsEqual();
    eq[i].in[0] <== a[i];
    eq[i].in[1] <== product[i];
    eq[i].out === 1;
  }

  // Any trailing coefficients of the product are zero
  component isz[newSize - Na];
  for(var i = Na; i<newSize; i++) {
    isz[i-Na] = IsZero();
    isz[i-Na].in <== product[i];
    isz[i-Na].out === 1;
  }
}

template VerifyEncrypt(q, nq, N) {
  signal input r[N];
  signal input m[N];
  signal input h[N];
  var newSize = N + N - 1;
  signal input quotient[N];
  signal input remainder[N];

  // TODO could this be more efficient?
  var rhq[newSize] = MultiplyPolynomials(q, nq, N, N)(r, h);
  for(var i = 0; i<N; i++) {
    rhq[i] = Modulus(q, nq)(rhq[i] + m[i]);
  }

  var I[N+1];
  I[0] = 1;
  I[N] = q-1;
  VerifyDividePolynomials(q, nq, newSize, N+1, N)(rhq, I, quotient, remainder);
}

// TODO need to check f matches fp?
// this would be done by checking f,fp,h all together by encrypting a known value
// and successfully decrypting it
// is there an easy attack on that?
template VerifyDecrypt(q, nq, p, np, N) {
  signal input f[N];
  signal input fp[N];
  signal input e[N];
  var newSize = N + N - 1;
  signal input quotient1[N];
  signal input remainder1[N];
  signal input quotient2[N];
  signal input remainder2[N];

  var a[newSize] = MultiplyPolynomials(q, nq, N, N)(f, e);

  var I[N+1];
  I[0] = 1;
  I[N] = q-1;
  VerifyDividePolynomials(q, nq, newSize, N+1, N)(a, I, quotient1, remainder1);

  var b[N];
  for(var i = 0; i < N; i++) {
    var gt = LessThan(nq)([ q/2, remainder1[i] ]);
    b[i] = Modulus(p, np)(remainder1[i] + gt);
  }

  var c[newSize] = MultiplyPolynomials(p, np, N, N)(fp, b);

  I[N] = p-1;
  VerifyDividePolynomials(p, np, newSize, N+1, N)(c, I, quotient2, remainder2);

}
