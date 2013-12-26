var toggler = function(evt) {
	var target = evt.target,
		id = target.id;
		
	document.getElementById(id+"-target").classList.toggle("hidden");
	document.getElementById(target.dataset.hide+"-target").classList.add("hidden");

};

var toggles = document.getElementsByClassName("toggle");
for (var i = toggles.length - 1; i >= 0; i--) {
	toggles[i].addEventListener("click",toggler);
}