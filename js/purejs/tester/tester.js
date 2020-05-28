"use strict";
/*Compiled using Cheerp (R) by Leaning Technologies Ltd*/
var __imul=Math.imul;
var __fround=Math.fround;
var oSlot=0;var nullArray=[null];var nullObj={d:nullArray,o:0};
function __Z7webMainv(){
	var tmp0=null;
	tmp0=null;
	tmp0=_cheerpCreate_ZN6client6StringC2EPKc();
	console.log(tmp0);
}
function _cheerpCreate_ZN6client6StringC2EPKc(){
	return String(__ZN6client6String11fromCharPtrIcEEPS0_PKT_());
}
function __ZN6client6String11fromCharPtrIcEEPS0_PKT_(){
	var tmp0=null,tmp1=null,tmp2=null,tmp3=null,tmp4=null;
	tmp0={d:_$pstr,o:0};
	tmp1=null;
	tmp1=String();
	tmp1=tmp1;
	tmp2=null;
	while(1){
		tmp4=tmp0;
		if((tmp4.d[tmp4.o]&255)!==0){
			tmp4=tmp1;
			tmp3=tmp0;
			tmp2=String.fromCharCode(tmp3.d[tmp3.o]<<24>>24);
			tmp1=tmp4.concat(tmp2);
			tmp4=tmp0;
			tmp0={d:tmp4.d,o:tmp4.o+1|0};
			continue;
		}
		break;
	}
	return tmp1;
}
function __ZN7testOsc8triangleEd(Larg0,Larg1){
	var tmp0=null;
	tmp0=Larg1;
	tmp0=18* +tmp0;
	return +tmp0;
}
function __ZN7testOscC1Ev(Larg0){
	var tmp0=null;
	tmp0=Larg0;
	tmp0.d0=0;
}
var _$pstr=new Uint8Array([84,101,115,116,101,114,32,84,114,97,110,115,112,105,108,101,0]);
function testOsc(){
	this.d0=-0.;
	;
	this.d=[this];
	if (arguments.length===1&&arguments[0]===undefined){
		return;
	}
	__ZN7testOscC1Ev(this);
}
testOsc.prototype.triangle=function (a0){
	return __ZN7testOsc8triangleEd(this,a0);
};
testOsc.promise=
Promise.resolve();
__Z7webMainv();
