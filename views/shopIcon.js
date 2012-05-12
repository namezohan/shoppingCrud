(function () {
	var input = document.getElementById("icon");
	function showUploadedItem (source) {
  		var divIcon = $(".image_icon");
        divIcon.css({'background-image':"url("+source+")","background-repeat":"no-repeat"});
		 divIcon.bind('click',function(evt) {
			$('<div>').simpledialog2({
				 mode: 'button',
				    headerText: 'Action',
				    buttons : {
				      'Delete': {
				        click: function () { 
				        		divIcon.css('background-image',"none");
				        		shopData.icon = '';
				        },
				        icon: "minus",
				        theme: "d"
				      },
				      'Close': {
				        click: function () { 
				          $('#buttonoutput').text('Cancel');
				        },
				        icon: "delete",
				        theme: "c"
				      }
				 }
 	      	});
		        
    	});
	}
	   
 	input.addEventListener("change", function (evt) {
 		var i = 0, len = this.files.length, img, reader, file;
	
		for ( ; i < len; i++ ) {
			file = this.files[i];
	
			if (!!file.type.match(/image.*/)) {
				if ( window.FileReader ) {
					reader = new FileReader();
					reader.onloadend = function (e) { 
						shopData.icon = e.target.result;
						showUploadedItem(e.target.result, file.fileName);
					};
					reader.readAsDataURL(file);
				}
			}	
		}
	
	}, false);

}());
