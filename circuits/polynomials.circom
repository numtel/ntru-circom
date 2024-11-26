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
  component ltP = LessThan(n);
  ltP.in[0] <== p;
  ltP.in[1] <== y;
  ltP.out === 0;
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
