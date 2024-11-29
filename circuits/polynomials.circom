pragma circom 2.1.0;

include "comparators.circom";

include "control-flow.circom";

template Degree(N) {
  signal input coeff[N];
  signal output out;

  var buffer = 0;
  for(var i = N - 1; i >= 0; i--) {
    var coeffIsZero = IsZero()(coeff[i]);
    var bufferIsNull = IsZero()(buffer);
    var newVal = IfElse()(coeffIsZero, 0, i + 1);
    var bufferAdd = IfElse()(bufferIsNull, newVal, 0);
    buffer = buffer + bufferAdd;
  }
  out <== buffer - 1;
}

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

// p: divisor
// n: number of bits in p
template ModInverse(p, n) {
  signal input a;
  signal output out;

  var aP = Modulus(p, n)(a);
  var aPP = Modulus(p, n)(aP + p);
  var buffer = 0;
  for (var x = 1; x < p; x++) {
    var aPPxP = Modulus(p, n)(aPP * x);
    var valIsOne = IsZero()(aPPxP - 1);
    var bufferIsNull = IsZero()(buffer);
    var newVal = IfElse()(valIsOne, x, 0);
    var bufferAdd = IfElse()(bufferIsNull, newVal, 0);
    buffer = buffer + bufferAdd;
  }
  out <== buffer;
}

template AddPolynomials(p, np, N) {
  signal input a[N];
  signal input b[N];
  signal output out[N];

  for (var i = 0; i < N; i++) {
    var abP = Modulus(p, np)(a[i] + b[i] + p);
    out[i] <== abP;
  }
}

template SubtractPolynomials(p, np, N) {
  signal input a[N];
  signal input b[N];
  signal output out[N];

  for (var i = 0; i < N; i++) {
    var abP = Modulus(p, np)(a[i] - b[i] + p);
    out[i] <== abP;
  }
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
  for (var k = 0; k < Na + Nb - 1; k++) {
    out[k] <== buffer[k];
  }
}

// Instead of doing all the work of calculating the division of the polynomials,
// just verify the calculation using multiplication
template VerifyDividePolynomials(p, np, Na, Nb) {
  signal input a[Na]; // dividend
  signal input b[Nb]; // divisor
  signal input quotient[Na];
  signal input remainder[Na];

  var newSize = Na + Nb - 1;
  var product[newSize] = MultiplyPolynomials(p, np, Nb, Na)(b, quotient);
  for(var i = 0; i<Na; i++) {
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
  // TODO could m be length newSize instead of N?
  signal input m[N];
  signal input h[N];
  var newSize = N + N - 1;
  signal input quotient[newSize];
  signal input remainder[newSize];

  // TODO could this be more efficient?
  var rhq[newSize] = MultiplyPolynomials(q, nq, N, N)(r, h);
  for(var i = 0; i<N; i++) {
    rhq[i] = Modulus(q, nq)(rhq[i] + m[i]);
  }

  var I[N+1];
  I[0] = 1;
  I[N] = q-1;
  VerifyDividePolynomials(q, nq, newSize, N+1)(rhq, I, quotient, remainder);
}

