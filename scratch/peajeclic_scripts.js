
// ========================

// ========================

// ========================

// ========================

function nobackbutton(){
   window.location.hash="no-back-button";
   window.location.hash="Again-No-back-button" //chrome
   window.onhashchange=function(){window.location.hash="no-back-button";}
}


// ========================
 //<![CDATA[ 
var tlJsHost = ((window.location.protocol == "https:") ? "https://secure.trust-provider.com/" : "http://www.trustlogo.com/");
document.write(unescape("%3Cscript src='" + tlJsHost + "trustlogo/javascript/trustlogo.js' type='text/javascript'%3E%3C/script%3E"));
//]]>

// ========================

// ========================

  /*------------------------------- INICIO DEL GRID EN BLANCO PARA LA CAPTURA DE LOS TICKETS ------------------------------*/
$(function () {
    // Initialize appendGrid
    $('#tblAppendGrid').appendGrid('init', {
        caption: 'A continuación ingrese los datos de sus tickets para generar su factura',
        captionTooltip: 'Datos para la recuperación',
        initRows: 1,
		maxRowsAllowed:40,
		maxNumRowsReached: function () {
            // Show an alert message
            alert('Sólo se pueden capturar hasta 40 folios.');
        },
        columns: [
                { name: 'Folio', display: 'Secuencial', type: 'text', ctrlAttr: { maxlength: 100, title: 'Capture el Secuencial de su ticket' }, ctrlCss: { width: '100px'}, uiTooltip: { show: true}  },
               /* { name: 'Year', display: 'Year', type: 'ui-spinner', ctrlAttr: { maxlength: 4 }, ctrlCss: { width: '40px' }, uiOption: { min: 2000, max: new Date().getFullYear()} },
                { name: 'Origin', display: 'Origin', type: 'ui-autocomplete', uiOption: { source: ['Hong Kong', 'Taiwan', 'Japan', 'Korea', 'US', 'Others']} },*/
                { name: 'Fecha', display: 'Fecha del cruce', type: 'ui-datepicker', ctrlAttr: { maxlength: 20 }, ctrlCss: { width: '150px' }, uiOption: {dateFormat: 'dd/mm/yy'} },
				{ name: 'Hora', display: 'Hora', type: 'text', ctrlAttr: { maxlength: 2 }, ctrlCss: { width: '40px' }, uiOption: { min: 01, max: 24} },
				{ name: 'Minuto', display: 'Minuto', type: 'text', ctrlAttr: { maxlength: 2 }, ctrlCss: { width: '40px' }, uiOption: { min: 00, max: 59}},
				{ name: 'Segundo', display: 'Segundo', type: 'text', ctrlAttr: { maxlength: 2 }, ctrlCss: { width: '40px' }, uiOption: { min: 00, max: 59}},
              //  { name: 'Hora', display: 'Hora', type: 'datetime-local', ctrlAttr: { maxlength: 200, title: 'Hora del cruce' }, ctrlCss: { width: '200px' }, uiTooltip: { show: true}, value:'2011-12-21T11:33:23Z' },
			  
			  	{ name: 'Pago', display: 'Forma Pago', type: 'select', ctrlAttr: { title: 'Selecciona Forma de Pago' } , ctrlOptions: 'Efectivo:Efectivo;TDD:Tarjeta de Debito;TDC:Tarjeta de Credito' , uiTooltip: { show: true}  },
			  
                { name: 'Total', display: 'Total', type: 'text', ctrlAttr: { maxlength: 10 }, ctrlCss: { width: '50px', 'text-align': 'right' }},
				/*{ name: 'Estatus', display: 'Estatus', type: 'span', ctrlAttr: { maxlength: 10 }, ctrlCss: { width: '50px', 'text-align': 'right','background':'red' }, cellCss: { 'background': '#000' }value: "" }*/
            ],
			i18n: {
            	append: 'Agregar Fila',
				removeLast: 'Quitar Última Fila',
				insert: 'Insertar Fila Arriba',
				remove: 'Quitar Fila Actual',
				moveUp: 'Mover hacia arriba',
				moveDown: 'Mover hacia abajo'
        	}
			,
			afterRowAppended: function (caller, parentRowIndex, addedRowIndex) {
				//Esta función se utiliza para enfocarse en el campo folio inmediatamente después de agregar un campo
            var count3 =  $('#tblAppendGrid').appendGrid('getRowCount');//Contador de todos los registros de la tabla
	 		for(var j=0;j<count3;j++){
		   	var uniqueIndex2 = $('#tblAppendGrid').appendGrid('getUniqueIndex', j);
		   $("#tblAppendGrid_Folio_"+uniqueIndex2);
		   //Fin de la función para enfoque-----------------------------------
	//Función que válida que la hora, minuto y segundo sean sólo numéricos	   
      $( "body" ).on( "keypress", '#tblAppendGrid_Hora_'+uniqueIndex2, function() {
		return isNumberKey(event);
  });
   $( "body" ).on( "keypress", '#tblAppendGrid_Minuto_'+uniqueIndex2, function() {
		return isNumberKey(event);
  });
   $( "body" ).on( "keypress", '#tblAppendGrid_Segundo_'+uniqueIndex2, function() {
		return isNumberKey(event);
  });
   $( "body" ).on( "keypress", '#tblAppendGrid_Total_'+uniqueIndex2, function() {
		return isNumberKey(event);
  });
  //Fin de funcion del tiempo-------------------------------------------------
	  }
        },
		
	afterRowInserted: function (caller, parentRowIndex, addedRowIndex) {
	//Función que válida que la hora, minuto y segundo sean sólo numéricos	
             var count3 =  $('#tblAppendGrid').appendGrid('getRowCount');
	  for(var j=0;j<count3;j++){
		   var uniqueIndex2 = $('#tblAppendGrid').appendGrid('getUniqueIndex', j);
      $( "body" ).on( "keypress", '#tblAppendGrid_Hora_'+uniqueIndex2, function() {
		return isNumberKey(event);
  });
   $( "body" ).on( "keypress", '#tblAppendGrid_Minuto_'+uniqueIndex2, function() {
		return isNumberKey(event);
  });
   $( "body" ).on( "keypress", '#tblAppendGrid_Segundo_'+uniqueIndex2, function() {
		return isNumberKey(event);
  });
   $( "body" ).on( "keypress", '#tblAppendGrid_Total_'+uniqueIndex2, function() {
		return isNumberKey(event);
  });
	  }
        },
		//Datos iniciales, todos en blanco---------------------------------------------------------
        initData: [{ 'Folio': '', 'Fecha': '', 'Hora':'' , 'Minuto': '', 'Segundo': '', 'Total': ''}]
    });
});

  
// ========================

  //Aqui se compruban los tickets capturados---------------------------------------------------------
  $(document).ready(function(e) {

	// Inicio Agregado 2024-04-16
	$("#btn_asistencia_modal").click(function() {
		$("#myModal3").hide();
	});
	
	$(".close3").click(function() {
		//alert('ok');
		//$.scrollTo($("#seccion_grid"), { duration: 0});
		//$("#myModal3").hide();
		
		$('html, body').animate({
			scrollTop: $("#seccion_grid").offset().top
		}, 1000);
	});
	
	// Fin Agregado 2024-04-16
	  
	  // Modal
	$('#myBtn').trigger('click');
	  
  
   $("#comprobar").button().click(function(){
	   $('#tblAppendGrid').appendGrid('removeEmptyRows');//Elimino filas en blanco
	   var count2 =  $('#tblAppendGrid').appendGrid('getRowCount');//Obtengo el número total de registros de la tabla
	   var g=1;
	   var myLengthH;
	   var myLengthM;
	   var myLengthS;
	   
	   var id_horas = new Array();
	   var id_minutos = new Array();
	   var id_segundos = new Array();
	   
	   for(var j=0;j<count2;j++){
		   var uniqueIndex = $('#tblAppendGrid').appendGrid('getUniqueIndex', j);//Obtengo el id de cada fila creada
    	//alert('The unique index of the third row is ' + uniqueIndex);
		   //parsear folios a enteros
		   var a = parseInt($('#tblAppendGrid_Folio_'+uniqueIndex).val());//Convierto a entero el folio
		   $('#tblAppendGrid_Folio_'+uniqueIndex).val(a);//Asigno el valor a al Folio
		   //-------------Se guardan la hora, minutos y segundos en los arreglos correspondientes------------//
		   id_horas.push($('#tblAppendGrid_Hora_'+uniqueIndex).val().length);
		   id_minutos.push($('#tblAppendGrid_Minuto_'+uniqueIndex).val().length);
		   id_segundos.push($('#tblAppendGrid_Segundo_'+uniqueIndex).val().length);
		//----------------------CAMBIAR A DOS CEROS------------------------------
		var num =  parseFloat($('#tblAppendGrid_Total_'+uniqueIndex).val());
		var n = num.toFixed(1);
		/*$('#tblAppendGrid_Total_'+g).val(n);	*/	// Comentada 2018-02-20 y agregada la siguiente línea
		$('#tblAppendGrid_Total_'+uniqueIndex).val(n);
		
		
     //----------------------------------------AGREGAR 0 AL SPINNERS DE TIEMPO----------------------------------------//
		 //console.log(count2);
		
		   myLengthH = $('#tblAppendGrid_Hora_'+uniqueIndex).val().length;
		   myLengthM = $('#tblAppendGrid_Minuto_'+uniqueIndex).val().length;
		   myLengthS = $('#tblAppendGrid_Segundo_'+uniqueIndex).val().length;
		// alert(myLength);
		 if($('#tblAppendGrid_Hora_'+uniqueIndex).val()<10 && myLengthH <2){
			 $('#tblAppendGrid_Hora_'+uniqueIndex).val('0'+ $('#tblAppendGrid_Hora_'+uniqueIndex).val());
		 }
		  if($('#tblAppendGrid_Minuto_'+uniqueIndex).val()<10 && myLengthM <2){
			 $('#tblAppendGrid_Minuto_'+uniqueIndex).val('0'+ $('#tblAppendGrid_Minuto_'+uniqueIndex).val());
		 }
		  if($('#tblAppendGrid_Segundo_'+uniqueIndex).val()<10 && myLengthS <2){
			 $('#tblAppendGrid_Segundo_'+uniqueIndex).val('0'+ $('#tblAppendGrid_Segundo_'+uniqueIndex).val());
		 }
	// });
	 g++;
	   }
	 //--------------------------------------FIN AGREGAR 0 AL SPINNER------------------------------------------------------//
	   
	var data = $('#tblAppendGrid').appendGrid('getAllValue');//Obtiene todos los datos de la tabla para su validación
	
	if(data==""){
		alert("Debe capturar al menos un cruce")
		return false;
	}else{ 
		$("#enviar").show();
		var arreglo = new Array();	
				     
	
	  // arreglo.push(ini);
	   var count =  $('#tblAppendGrid').appendGrid('getRowCount');
	   var fechas = new Array();
	   var meses = new Array();
	   var folios_a= new Array();
	   var formas_pago = new Array();
	   
	   //--------------Guarda el folio, la fecha y hora -------------------//
	   for(var j=0; j<count; j++){
			folios_a.push(data[j].Folio + data[j].Fecha + data[j].Hora + data[j].Minuto + data[j].Segundo + data[j].Total);
			formas_pago.push(data[j].Pago);	// agrega al arreglo la forma de pago de cada Ticket
	   }
	   
	   
	   console.log("FORMAS DE PAGO");
	   // Se revisa que los Tickets sean de un mismo Forma de Pago
	   for(var p=0; p<count; p++){
		   	for(var q=p+1; q<count; q++){
				if(formas_pago[p] != formas_pago[q]){
					alert("Los Tickets deben ser de una misma Forma de Pago");
					return false;
				}
			}
		   console.log(formas_pago[p]);
	   }	// fin for
	   
	   
	   //--------------Se buscan folios repetidos -------------------//
	   for(var j=0; j<count; j++){
		   for(var k=j+1; k<count; k++){
				if (folios_a[j] == folios_a[k]) {
					alert("Elimine los folios repetidos");	
					return false;
				}
		   }
	   }
 
	   var g=1;
	   for(var j=0;j<count;j++){
		   //--------------Guarda el folio, la fecha y hora solo para pruebas-------------------//
		   /*folios_a.push(data[j].Folio+data[j].Fecha+data[j].Hora+data[j].Minuto+data[j].Segundo+data[j].Total);
		   console.log("Folio: "+folios_a[j]);*/
		   
		   //--------------------------VALIDAR FOLIOS IGUALES----------------------------------//
		    /*for(var i = 0; i < folios_a.length - 1; i++) {
        		if(folios_a[i] == folios_a[i+1]) {
					alert("Elimine los folios repetidos");
            		return false;
       			 }else{
					//alert("fechas iguales");
	 			 }
	 		}*/
	
			//------Guardamos las fechas en el arrelo, para obtener los meses de cada una, y validar que sean del mismo mes-----------//		   
		   fechas.push(data[j].Fecha);
		   console.log(fechas[j]);
		   
		   var f=fechas[j].split("/");
		   
		   var curdate = new Date(f[2], f[0]-1, f[1]);
		   var fe=f[1];
		   console.log(fe);
		   
		   meses.push(fe);
		   
		   console.log[meses[0]];
		   $("#mes").val(fe);
		   
	   }	// fin for
	   
	   
	//alert(meses.length);
	//identical(meses);
	 for(var i = 0; i < meses.length - 1; i++) {
        if(meses[i] != meses[i+1]) {
			alert("Las fechas deben ser del mismo mes");
            return false;
        }else{
			//alert("fechas iguales");
	 }
	}	// fin for
   
	
//--Función que permite la comparación de los folios capturados y regresa su estado en la base de datos--------//	
	$.ajax({
	    type: 'post',
        url: "datos.php",
		//dataType: "json",
        data: {mydata:data, mes: fe},
        success: function(dataa) 
                  {
					 
					   //$("#simple-msg").html('<pre><code class="prettyprint">'+dataa+'</code></pre>');
//dataa devuelve la información comparada de los folios, y los transforma en un Json para su uso en una tabla con los folios validados  
					   var datos = JSON.parse(dataa);
						//  alert(datos[0]['Fecha']);
						var colores= new Array();
						for(var k=0;k<datos.length;k++){
							/* var rowIndex = $('#tblAppendGrid').appendGrid('getRowIndex', k);
    alert('The row index of uniqueIndex='+k+ 'is ' + rowIndex);	*/
							
						 var color = datos[k]['Estatus'];
						  console.log(datos[k]['Estatus']);
						  colores.push(datos[k]['Estatus']);
						  if(datos[k]['Estatus']=='No existe'){
							  var no_existe=1;
						  }
						 // $("#tblAppendGrid").css("color","red");
						 
						  }	// Fin for
						  
					  $(function () {
						 
    // Initialize appendGrid
    $('#tblAppendGrid').appendGrid('init', {
        caption: 'A continuación ingrese los datos de sus tickets para generar su factura',
        captionTooltip: 'A continuación ingrese los datos de sus tickets para generar su factura',
        initRows: 1,
        columns: [
               /* {
                    name: 'id', display: 'ID', type: 'text', ctrlAttr: { maxlength: 100 },
                    // Make the column resizable
                    resizable: true, ctrlCss: { width: '100%' }, displayCss: { 'min-width': '160px' },
                    // Customize UI tooltip
                    displayTooltip: { items: 'td', content: 'You can resize this column!' }
                },*/
                { name: 'Folio', display: 'Secuencial', type: 'text', ctrlAttr: { maxlength: 100, title: 'Capture el Secuencial de su ticket' }, ctrlCss: { width: '100px' }, uiTooltip: { show: true} },
               /* { name: 'Year', display: 'Year', type: 'ui-spinner', ctrlAttr: { maxlength: 4 }, ctrlCss: { width: '40px' }, uiOption: { min: 2000, max: new Date().getFullYear()} },
                { name: 'Origin', display: 'Origin', type: 'ui-autocomplete', uiOption: { source: ['Hong Kong', 'Taiwan', 'Japan', 'Korea', 'US', 'Others']} },*/
                { name: 'Fecha', display: 'Fecha del cruce', type: 'ui-datepicker', ctrlAttr: { maxlength: 20 }, ctrlCss: { width: '150px' }, uiOption: { dateFormat: 'dd/mm/yy' } },
              //  { name: 'Hora', display: 'Hora', type: 'datetime-local', ctrlAttr: { maxlength: 200, title: 'Hora del cruce' }, ctrlCss: { width: '200px' }, uiTooltip: { show: true}, value:'2011-12-21T11:33:23Z' },
			  { name: 'Hora', display: 'Hora', type: 'text', ctrlAttr: { maxlength: 2 }, ctrlCss: { width: '40px' }, uiOption: { min: 1, max: 24} },
			  { name: 'Minuto', display: 'Minuto', type: 'text', ctrlAttr: { maxlength: 2 }, ctrlCss: { width: '40px' }, uiOption: { min: 01, max: 60} },
				{ name: 'Segundo', display: 'Segundo', type: 'text', ctrlAttr: { maxlength: 2 }, ctrlCss: { width: '40px' }, uiOption: { min: 01, max: 60} },
				{ name: 'Pago', display: 'Forma Pago', type: 'select', ctrlAttr: { title: 'Selecciona Forma de Pago' } , ctrlOptions: 'Efectivo:Efectivo;TDD:Tarjeta de Debito;TDC:Tarjeta de Credito' , uiTooltip: { show: true}  },
                { name: 'Total', display: 'Total', type: 'text', ctrlAttr: { maxlength: 10 }, ctrlCss: { width: '50px', 'text-align': 'right' }},
				{ name: 'Estatus', display: 'Estatus', type: 'text', ctrlAttr: { maxlength: 10 }, ctrlCss: { width: '50px', 'text-align': 'right'}/*/,cellCss: { 'background': ''+color+'' }*/}
            ],
			afterRowAppended: function (caller, parentRowIndex, addedRowIndex) {
             var count3 =  $('#tblAppendGrid').appendGrid('getRowCount');
	  for(var j=0;j<count3;j++){
		   var uniqueIndex2 = $('#tblAppendGrid').appendGrid('getUniqueIndex', j);
		    $("#tblAppendGrid_Folio_"+uniqueIndex2);
      $( "body" ).on( "keypress", '#tblAppendGrid_Hora_'+uniqueIndex2, function() {
		return isNumberKey(event);
  });
   $( "body" ).on( "keypress", '#tblAppendGrid_Minuto_'+uniqueIndex2, function() {
		return isNumberKey(event);
  });
   $( "body" ).on( "keypress", '#tblAppendGrid_Segundo_'+uniqueIndex2, function() {
		return isNumberKey(event);
  });
   $( "body" ).on( "keypress", '#tblAppendGrid_Total_'+uniqueIndex2, function() {
		return isNumberKey(event);
  });
	  }
        },
	afterRowInserted: function (caller, parentRowIndex, addedRowIndex) {
             var count3 =  $('#tblAppendGrid').appendGrid('getRowCount');
	  for(var j=0;j<count3;j++){
		   var uniqueIndex2 = $('#tblAppendGrid').appendGrid('getUniqueIndex', j);
      $( "body" ).on( "keypress", '#tblAppendGrid_Hora_'+uniqueIndex2, function() {
		return isNumberKey(event);
  });
   $( "body" ).on( "keypress", '#tblAppendGrid_Minuto_'+uniqueIndex2, function() {
		return isNumberKey(event);
  });
   $( "body" ).on( "keypress", '#tblAppendGrid_Segundo_'+uniqueIndex2, function() {
		return isNumberKey(event);
  });
   $( "body" ).on( "keypress", '#tblAppendGrid_Total_'+uniqueIndex2, function() {
		return isNumberKey(event);
  });
	  }
        },
        initData: datos,
            
    });
});     
//CAMBIAR COLOR DE ESTATUS------------------------------------------------------
var c=1;    
for(var k=0;k<datos.length;k++){
/*							 var rowIndex = $('#tblAppendGrid').appendGrid('getRowIndex', k);
    alert('The row index of uniqueIndex='+k+ 'is ' + rowIndex);	*/
							
						 var color = datos[k]['Color'];
						  console.log(datos[k]['Estatus']);
						  colores.push(datos[k]['Estatus']);
						  if(datos[k]['Estatus']=='No existe'){
							  var no_existe=1;
						  }
						  
						//  $("#tblAppendGrid").css("color","red");
//alert($("#tblAppendGrid_Estatus_"+c).val());  
$("#tblAppendGrid_Estatus_"+c).css("background",color);
$("tblAppendGrid_Row_"+c).css("background",color);

c++;      
 }	// Fin for
//FIN COLOR DE ESTATUS---------------------------------------------------------

				// Inicio Agregado 2024-04-16
				
				// Se revisa si hay tickets con estado diferente a OK
				// Si hay tickets con estado diferente a OK se muestra la ventana modal
				var tickets_dif_ok = 0;
				
				// Contador para saber el total de tickets No encontrado
				var cont_tickets_no_encontrado = 0;
				
				for(var kd=0;kd<datos.length;kd++){
					
					if(datos[kd]['Estatus'] != 'OK'){	
													
						tickets_dif_ok++;
													
					}	// FIN if
					
					if(datos[kd]['Estatus'] == 'No existe'){	
													
						cont_tickets_no_encontrado++;	
													
					}	// FIN if
					
				}	// FIN for
				
				
				if(tickets_dif_ok > 0){
					
					var tabla_info_tickets = '';
					var color_txt_ticket = '';
					var accion_ticket = '';
					var mensaje_ticket = '';
					var tabla_accion_mensaje = '';
					
					for(var kd=0;kd<datos.length;kd++){
						
						if(datos[kd]['Estatus'] != 'OK'){
							
							console.log(datos[kd]['Folio']);
							console.log(datos[kd]['Fecha']);
							console.log(datos[kd]['Total']);
							console.log(datos[kd]['Estatus']); 
							console.log(datos[kd]['Consulta']); 
							console.log('Correop: '+datos[kd]['Correop']);
							
							if(datos[kd]['Estatus'] == 'yafacturado'){
								color_txt_ticket = '#aeaeae';
								accion_ticket = 'Consulte el historial';
								mensaje_ticket = 'Su factura ya fue emitida, puede consultarla en el historial de sus facturas ingresando su RFC correcto '+datos[kd]['Rfcp']+' <a href="historial_facturas.php" target="_blank"><strong><u>Consulta el historial</u></strong></a>';
							}
							
							if(datos[kd]['Estatus'] == 'OK'){
								color_txt_ticket = '#80b042';
							}
							
							if(datos[kd]['Estatus'] == 'Pendiente'){
								color_txt_ticket = '#ff0000';
								accion_ticket = 'Intentar realizar su factura dentro de 1 hora';
								mensaje_ticket = 'Estimado Usuario, le informamos que su factura no ha sido generada debido a un error en sus datos de facturación. Le pedimos por favor verificar sus datos y/o situación fiscal con el SAT, y en un lapso de 1 hora le pedimos volver a intentar generar su factura. En caso, de que no lo haya logrado, le pedimos ponerse en contacto con <a href="mailto:facturacion-jala.mexico@egis-group.com" target="_blank">facturacion-jala.mexico@egis-group.com</a>';
							}
							
							// Este seria enviadoafi
							if(datos[kd]['Estatus'] == 'yafacturado' && datos[kd]['Estatusaux'] == 'enviadoafi'){
								color_txt_ticket = '#aeaeae';
								accion_ticket = 'Esperar 2 horas para recibir su factura o Consultar el historial';
								mensaje_ticket = 'Estimado Usuario, le informamos que su factura no fue generada debido a un problema de comunicación con el SAT.  Por lo que le sugerimos que en un lapso de 2 horas por favor revise el correo que nos proporcionó para verificar que ya la haya recibido:<strong> '+datos[kd]['Correop']+'</strong> . O bien, si lo prefiere puede consultar en el historial de sus facturas ingresando su RFC correcto '+datos[kd]['Rfcp']+' <a href="https://facturacionjalacompostela.com/peajeclic/historial_facturas.php" target="_blank"><strong><u>Consulta el historial</u></strong></a>';
							}
							
							$('#ticket_accion_txt').html(accion_ticket);
							$('#ticket_mensaje_txt').html(mensaje_ticket);
							
							tabla_info_tickets = '<table class="infotickets" width="70%" cellspacing="0" cellpadding="0" border="0" align="center" >';
							tabla_info_tickets += '<tr><td align="center" colspan="5"><strong>TICKET</strong></td><tr>';
							tabla_info_tickets += '<tr><td><strong>FOLIO</strong></td><td><strong>FECHA</strong></td><td><strong>HORA</strong></td><td><strong>TOTAL</strong></td><td><strong>ACCIÓN</strong></td><tr>';
							
							tabla_info_tickets += '<tr>';
							tabla_info_tickets += '<td>'+datos[kd]['Folio']+'</td>';
							tabla_info_tickets += '<td>'+datos[kd]['Fecha']+'</td>';
							tabla_info_tickets += '<td>'+datos[kd]['Hora']+':'+datos[kd]['Minuto']+':'+datos[kd]['Segundo']+'</td>';
							tabla_info_tickets += '<td>'+datos[kd]['Total']+'</td>';
							tabla_info_tickets += '<td>'+accion_ticket+'</td>';
							//tabla_info_tickets += '<td>'+datos[kd]['Estatusbd']+'</td>';
							tabla_info_tickets += '</tr>';
														
							tabla_info_tickets += '</table>';
							
							if(datos[kd]['Estatus'] == 'No existe'){
								//alert('No existe');
								var ticket_no_existe = 1;
							}
							
							// Salir del for
							break;
							
							
						}	// FIN if
						
						
					}	// FIN for	
					
					
					if(ticket_no_existe > 0){
						//alert('ticket_no_existe: '+ticket_no_existe);
						
						tabla_info_tickets = '';
						
						$('#info_tickets3').html(tabla_info_tickets);
						
						// Se muestra en la modal el total de tickets capturados en el grid
						$('#total_tickets_grid').html(datos.length);
						
						// Se muestra en la modal el total de tickets no encontrados
						$('#total_tickets_no_encontrados_grid').html(cont_tickets_no_encontrado);	
													
						$('#myBtn3').trigger('click');
					
					
					}else{	// else 
													
						$('#info_tickets').html(tabla_info_tickets);

						$('#myBtn2').trigger('click');
													
					}	// Fin else
					
					
				}	// FIN if	
				
				// Fin Agregado 2024-04-16


				  }		// FIN success
    }); 	// fin ajax
	}	// fin else
      });	// fin click #comprobar
	  
//CONTINUAR
$("#enviar").button().click(function(){
	
		$('#tblAppendGrid').appendGrid('removeEmptyRows');
		var data = $('#tblAppendGrid').appendGrid('getAllValue');
		
		//--------------------VALIDAR ESTATUS NO EXISTE--------------------------
	 	var estados_ = new Array();
		var formas_pago_g = new Array();
	 	var count =  $('#tblAppendGrid').appendGrid('getRowCount');
	 	//alert(count);
		
	 	for(var j=0;j<count;j++){
			   estados_.push(data[j].Estatus);
			   console.log("Array estados: "+estados_[j]);
			   formas_pago_g.push(data[j].Pago);
			   //VALIDAR FOLIOS IGUALES
		}	// fin for			//alert(estados_.length);
		
	 	var ne=0;
	 	var ok=0;
		
		 
		console.log("FORMAS DE PAGO GENERAR");
	    // Se revisa que los Tickets sean de un mismo Forma de Pago
	    for(var t=0; t<count; t++){
		   	for(var s=t+1; s<count; s++){
				if(formas_pago_g[t] != formas_pago_g[s]){
					alert("Los Tickets deben ser de una misma Forma de Pago");
					return false;
				}
			}
		   //console.log(formas_pago[p]);
	    }	// fin for
		
		
		for(var i = 0; i < estados_.length; i++) {
				//alert("Array estados: "+estados_[i]);
				if(estados_[i] != "OK") {
					ne++;
					//alert("No hay folios validos"+fi);
				//	alert("Array estados if: "+estados_[i]);
				  //  return false;
				}if(estados_[i] == "OK"){
					ok++;}
				
			/*	if(estados_[i] == "pendiente"){
					ne++;}*/
					//alert("Un folios validos");
				//	alert("Array estados if: "+estados_[i]);
					//alert("fechas iguales");
	 	}	// fin for
	
		if(ne>0 && ok>0){
			alert("Se descartarán los folios inválidos y ya facturados");
		} 	// fin if
	
		if(ne>0 && ok==0){
			alert("No existe ningún folio válido");
			return false;
		}	// fin if
		
		
		
		
		
		if(ok>0 && ne==0){
			alert("Generando proceso de facturación");	
		}	// fin if
		
		 //-----------------------------------------------------------------------------
		//var formulario2 = JSON.stringify(data);
		//alert(formulario2);
	
		if(data==""){
			alert("Debe capturar al menos un cruce")
			return false;
		}else{ 	// fin if
					/*  var folio=data[0].Folio;
					  var fecha=data[0].Fecha;
					  var total=data[0].Total;*/
					  //var datos = JSON.parse(data);
			var formulario = JSON.stringify(data);			  
			//	alert(formulario);			  
			$("#datos").val(formulario);	
			//alert($("#datos").val());		  
			var arreglo = new Array();				     
	
	  		// arreglo.push(ini);
	   		var count =  $('#tblAppendGrid').appendGrid('getRowCount');
		 	$("#noexiste").val(ne);
	 		$("#ok").val(ok);
	 		$("#grid_sample").submit();
	
			/*$.ajax({
				type: 'post',
				url: "../procesar.php",
				//dataType: "json",
				data: {mydata:data},
				success: function(respuesta) 
						  {
							document.location.href="../procesar.php";
						  }
			})*/
	 	}	// fin else
		
	});	// fin enviar
	
	//VER TICKET-----------------------------------------------------------------------------
	$("#ver_ticket").click(function(){
		 //event.preventDefault();
		$("#ticket").slideToggle();
		 return false;
		})
	
	});

function isNumberKey(evt)
		    {
				var charCode = (evt.which) ? evt.which : event.keyCode
			    if (charCode > 31 && (charCode < 48 || charCode > 57))
					return false;
	 
 				return true;
		    }
	  
// ========================

	// Get the modal
	var modal3 = document.getElementById("myModal3");

	// Get the button that opens the modal
	var btn3 = document.getElementById("myBtn3");

	var txtcerrar3 = document.getElementById("cerrarmensaje3");

	// Get the <span> element that closes the modal
	var span3 = document.getElementsByClassName("close3")[0];

	// When the user clicks the button, open the modal 
	btn3.onclick = function() {
	  modal3.style.display = "block";
	}

	// When the user clicks on <span> (x), close the modal
	span3.onclick = function() {
	  modal3.style.display = "none";
	}

	txtcerrar3.onclick = function() {
	  modal3.style.display = "none";
	}


	// When the user clicks anywhere outside of the modal, close it
	//window.onclick = function(event) {
	  //if (event.target == modal) {
		//modal.style.display = "none";
	  //}
	//}
	
// ========================

	// Get the modal
	var modal2 = document.getElementById("myModal2");

	// Get the button that opens the modal
	var btn2 = document.getElementById("myBtn2");

	var txtcerrar2 = document.getElementById("cerrarmensaje2");

	// Get the <span> element that closes the modal
	var span2 = document.getElementsByClassName("close2")[0];

	// When the user clicks the button, open the modal 
	btn2.onclick = function() {
	  modal2.style.display = "block";
	}

	// When the user clicks on <span> (x), close the modal
	span2.onclick = function() {
	  modal2.style.display = "none";
	}

	txtcerrar2.onclick = function() {
	  modal2.style.display = "none";
	}


	// When the user clicks anywhere outside of the modal, close it
	//window.onclick = function(event) {
	  //if (event.target == modal) {
		//modal.style.display = "none";
	  //}
	//}
	
// ========================

	// Get the modal
	var modal = document.getElementById("myModal");

	// Get the button that opens the modal
	var btn = document.getElementById("myBtn");

	var txtcerrar = document.getElementById("cerrarmensaje");

	// Get the <span> element that closes the modal
	var span = document.getElementsByClassName("close")[0];

	// When the user clicks the button, open the modal 
	btn.onclick = function() {
	  modal.style.display = "block";
	}

	// When the user clicks on <span> (x), close the modal
	span.onclick = function() {
	  modal.style.display = "none";
	}

	txtcerrar.onclick = function() {
	  modal.style.display = "none";
	}


	// When the user clicks anywhere outside of the modal, close it
	//window.onclick = function(event) {
	  //if (event.target == modal) {
		//modal.style.display = "none";
	  //}
	//}
	
// ========================

TrustLogo("https://facturacionjalacompostela.com/peajeclic/images/sectigo_trust_seal_lg_140x54.png", "SECOV", "none");
