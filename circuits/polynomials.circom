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

