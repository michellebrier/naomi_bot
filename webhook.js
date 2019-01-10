'use strict';

require('dotenv').config()

const APIAI_TOKEN = process.env.APIAI_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const FB_VALIDATION_TOKEN = process.env.FB_VALIDATION_TOKEN;
const YELP_TOKEN = process.env.YELP_TOKEN;

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const apiai = require('apiai');
const apiaiApp = apiai(APIAI_TOKEN);
const yelp = require('yelp-fusion');
const yelpClient = yelp.client(YELP_TOKEN);

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const server = app.listen(process.env.PORT || 5000, () => {
  console.log('Express server listening on port %d in %s mode', server.address().port, app.settings.env);
});

/* For Facebook Validation */
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] && req.query['hub.verify_token'] === FB_VALIDATION_TOKEN) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.status(403).end();
  }
});

/* Handling all messenges */
// app.post('/webhook', (req, res) => {
//   console.log(req.body);
//   if (req.body.object === 'page') {
//     req.body.entry.forEach((entry) => {
//       entry.messaging.forEach((event) => {
//         if (event.message && event.message.text) {
//           sendMessage(event);
//         }
//       });
//     });
//     res.status(200).end();
//   }
// });

// function sendMessage(event) {
//   let sender = event.sender.id;
//   let text = event.message.text;

//   let apiai = apiaiApp.textRequest(text, {
//     sessionId: 'poisson_cat'
//   });

//   apiai.on('response', (response) => {
//     let aiText = response.result.fulfillment.speech;

//     request({
//       url: 'https://graph.facebook.com/v2.6/me/messages',
//       qs: {access_token: PAGE_ACCESS_TOKEN},
//       method: 'POST',
//       json: {
//         recipient: {id: sender},
//         message: {text: aiText}
//       }
//     }, (error, response) => {
//       if (error) {
//           console.log('Error sending message: ', error);
//       } else if (response.body.error) {
//           console.log('Error: ', response.body.error);
//       }
//     });
//   });

//   apiai.on('error', (error) => {
//     console.log(error);
//   });

//   apiai.end();
// }

var yelp_term = ""
var yelp_num = ""

app.post('/ai', (req, res) => {
	if (req.body.queryResult.action === 'weather') {
	  	let city = req.body.queryResult.parameters['geo-city'];
	    let restUrl = 'http://api.openweathermap.org/data/2.5/weather?APPID='+WEATHER_API_KEY+'&q='+city;

	    request.get(restUrl, (err, response, body) => {
			if (!err && response.statusCode == 200) {
			    let json = JSON.parse(body);
			    let tempF = ~~(json.main.temp * 9/5 - 459.67);
			    let tempC = ~~(json.main.temp - 273.15);
			    let msg = 'The current condition in ' + json.name + ' is ' + json.weather[0].description + ' and the temperature is ' + tempF + ' ℉ (' +tempC+ ' ℃).'
			    return res.json({
			      fulfillmentText: msg,
			      source: 'weather'
			    });
			} else {
			    let errorMessage = 'I failed to look up the city name.';
			    return res.status(400).json({
			      status: {
			        code: 400,
			        errorType: errorMessage
			      }
			    });
			}
	    })
	} else if (req.body.queryResult.action === 'request_location') {
		yelp_term = req.body.queryResult.parameters['any'];
		if ('number' in req.body.queryResult.parameters) {
			yelp_num = req.body.queryResult.parameters['number'];
		}
	} else if (req.body.queryResult.action === 'discover' || req.body.queryResult.queryText === 'FACEBOOK_LOCATION') {
		var term;
		var num_responses;
		var searchJson = {};
		if (req.body.queryResult.action === 'discover') {
			term = req.body.queryResult.parameters['any'];
		  	let location_address = req.body.queryResult.parameters['location']['street-address'];
		  	let location_city = req.body.queryResult.parameters['location']['city'];
		  	let location_state = req.body.queryResult.parameters['location']['admin-area'];
		  	let location = location_address + ', ' + location_city + ', ' + location_state
		  	num_responses = req.body.queryResult.parameters['number'] === "" ? 5 : req.body.queryResult.parameters['number'];
		  	searchJson = {
		  		term: term,
		  		location: location,
		  		open_now: true
		  	}
		} else {
			term = yelp_term;
			let lat = req.body.originalDetectIntentRequest.payload.data.postback.data.lat;
		  	let long = req.body.originalDetectIntentRequest.payload.data.postback.data.long;
		  	num_responses = yelp_num === "" ? 5 : yelp_num;
		  	searchJson = {
				term: term,
		  		latitude: lat,
		  		longitude: long,
		  		open_now: true
			}
		}

	  	yelpClient.search(searchJson).then(response => {
	  		let json = response.jsonBody;
	  		let min_index = Math.min(json.businesses.length, num_responses);

	  		let richResponses = []

	  		for (var i = 0; i < min_index; i++) {
	  			let business = json.businesses[i];
	  			let subtitle = ""
		  		if ('price' in business && business.price != "") {
		  			subtitle += business.price + " - "
		  		}
		  		if ('distance' in business && business.distance != "") {
		  			subtitle += (business.distance / 1609.344).toPrecision(2) + " mi - "
		  		}
		  		subtitle += business.review_count + " reviews"

		  		let obj = {
		  			"card": {
		  				"title": business.name + " (" + business.rating + " stars)",
			  			"subtitle": subtitle,
			  			"imageUri": business.image_url,
			  			"buttons": [{
			  				"text": "View details",
			  				"postback": business.url
			  			}]
		  			}
		  		}

		  		richResponses.push(obj);
	  		}

	  		return res.json({
	  			fulfillmentMessages: richResponses
	  		});
	  	}).catch(e => {
	  		console.log(e);
	  	});
	}
});
