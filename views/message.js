	function jqmSimpleMessage(message) {
	    $("<div class='ui-loader ui-overlay-shadow ui-body-b ui-corner-all'><h2>" + message + "</h2></div>")
	        .css({
	            display: "block",
	            opacity: 0.96,
	            top: window.pageYOffset+100,
	            position:"absolute"
	        })
	        .appendTo("body").delay(1000)
	        .fadeOut(1000, function(){
	            $(this).remove();
	        });
	}