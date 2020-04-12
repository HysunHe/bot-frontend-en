/**
 * Author: Hysun He @ SCC Middleware. Apr.2018
 */
"use strict";

define(['ojs/ojcore', 'knockout', 'jquery', 'ojs/ojinputtext', 'ojs/ojknockout'
            , 'promise', 'ojs/ojlistview', 'ojs/ojarraytabledatasource'
            , 'ojs/ojfilmstrip', 'ojs/ojdialog'],
        function (oj, ko, $) {
            // Hysun He@2018-03-23: Conversation History Length (Unit: Day)
            var MAX_HISTORY_RECORDS = 30;
            var SO_SUFFIX = Math.ceil(Math.random() * 100000000);
            var LAST_SENT_MSG = "";
            var LAST_ACTIVITY_TIME = Date.now() / 1000 | 0;

            function model(context) {
                var self = this;
                var messageToBot;
                var currentConnection;

                self.waitingForText = ko.observable(false);

                var LOCATION_TYPE = 'location';
                var POSTBACK_TYPE = 'postback';

                var ws;
                var isForceClosed = false;

                self.allItems = ko.observableArray([]).extend({scrollFollow: '#listview'});
                var lastItemId = self.allItems().length;

                self.operationStack = [];
                var operationStackString = localStorage.getItem("__operationStack");
                if (operationStackString) {
                    self.operationStack = JSON.parse(operationStackString);
                }

                var initConversationHistory = function() {
                    if (self.operationStack && self.operationStack.length > 0) {
                        self.operationStack.forEach(function (op) {
                            self.allItems.push(op);
                        });
                    } else {
                        lastItemId ++;
                        var itemOne = {
                            id: lastItemId,
                            payload: {
                                "type": "text",
                                "text": $("#initMsg1").val().replace('{userName}', self.properties.userName)
                            },
                            bot: true
                        };
                        self.allItems.push(itemOne);
                        lastItemId ++;
                        var itemTwo = {
                            id: lastItemId,
                            payload: {
                                "type": "text",
                                "text": $("#initMsg2").val()
                            },
                            bot: true
                        };
                        self.allItems.push(itemTwo);                        
                    }
                    lastItemId = self.allItems().length;
                    scrollBottom();
                }

                context.props.then(function (properties) {
                    self.properties = properties;
                    initMessageToBot(self.properties.channel);
                    initWebSocketIfNeeded();
                    initConversationHistory();
                });

                self.isMobileDev = ko.pureComputed(function() {
                    var ua = navigator.userAgent.toLowerCase();
                    var isAndroid = ua.indexOf("android") > -1;
                    if(isAndroid) {
                        return true;
                    } else {
                        var iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                        if(iOS) {
                            return true;
                        } 
                    }
                    return false;
                });

                self.dispose = function (context) {
                    if (ws) {
                        ws.close();
                    }
                    isForceClosed = true;
                    self.waitingForText(false);
                    SO_SUFFIX = Math.ceil(Math.random() * 100000000);
                };

                var initLck = false;
                var initWebSocket = function () {
                    if (initLck) {
                        console.log("* init in progress, ignore...");
                        log.addLog("* init in progress, ignore...");
                        return;
                    }

                    initLck = true;
                    debug("init websocket");
                    currentConnection = self.properties.websocketConnectionUrl + "?user=" + self.properties.userId + "&v=" + SO_SUFFIX;
                    debug("Init ws: " +  currentConnection);
                    try {
                        ws = new WebSocket(currentConnection);
                    } catch (err) {
                        console.error(err.name + ":: " + err.message);
                        alert("Failed to create WebSocket to the server. " +  err.name +  "::" + err.message);
                    }
                    if(!ws) {
                        initLck = false;
                        return;
                    }

                    isForceClosed = false;
                    ws.onmessage = function (evt) {
                        self.waitingForText(false);
                        scrollBottom();
                        debug("Message received: " + evt.data);
                        var response = JSON.parse(evt.data);
                        if (response.hasOwnProperty('body') && response.body.hasOwnProperty('messagePayload')) {
                            // process IB V1.1 message
                            // we no longer support V1.0 messages, the webhook platform version
                            // should be set to 1.1
                            var messagePayload = response.body.messagePayload;
                            debug("Message payload: " + JSON.stringify(messagePayload));
                            self.addItem(messagePayload, true)
                        } else if (response.hasOwnProperty('error')) {
                            self.addItem({"type": "text", "text": response.error.message}, true);
                        }
                    };

                    ws.onclose = function () {
                        debug("Connection is closed...");
                        self.dispose();
                    };

                    ws.onerror = function (error) {
                        debug("Websocket goes to ERROR");
                        self.waitingForText(false);
                        self.onerror(error);
                        self.dispose();
                    };

                    initLck = false;
                }

                var initWebSocketIfNeeded = function () {
                    debug("init websocketIF");
                    var connection = self.properties.websocketConnectionUrl + "?user=" + self.properties.userId + "&v=" + SO_SUFFIX;
                    if (connection !== currentConnection) {
                        initWebSocket();
                    }
                }

                self.value = ko.observable("");
                self.itemToAdd = ko.observable("");
                self.scrollPos = ko.observable(5000);

                self.reset = function () {
                    // re-init websocket when userId or connection url has changed
                    initWebSocketIfNeeded();
                    self.allItems([]);
                    initConversationHistory();
                    // re-init messageToBot to pick up changes to channel id
                    initMessageToBot(self.properties.channel);
                }

                var initMessageToBot = function (channel) {
                    messageToBot = {
                        "to": {
                            "type": "bot",
                            "id": channel
                        }
                    };
                }
                
                self.sendMessage = function (md, evt, msg) {
                    let msgToSend = msg || self.value();
                    console.log("message = " + msgToSend);

                    let isNeedCache = true;
                    if (!msgToSend || /^\s*$/.test(msgToSend)) {
                        console.log("Last sent message not found!");
                        lastItemId ++;
                        var item = {
                            id: lastItemId,
                            payload: {
                                "type": "text",
                                "text": $("#initMsg3").val()
                            },
                            bot: true
                        };
                        self.allItems.push(item);
                        
                        msgToSend = "hello";
                        isNeedCache = false;
                    }

                    messageToBot.messagePayload= {type:"text",text:msgToSend};
                    if(!msg || /^\s*$/.test(msg)) {
                       self.addItem(msgToSend, false, isNeedCache);
                       self.value("");
                    }
                    sendToBot(messageToBot);
                    LAST_SENT_MSG = msgToSend;
                };

                var handleSendMsg = function(ws, message, isAcknowledge) {
                    // wait for websocket until open
                    self.waitingForText(true);
                    waitForSocketConnection(ws, function () {
                        if (isAcknowledge === undefined || !isAcknowledge) {
                            self.waitingForText(true);
                        }
                        ws.send(JSON.stringify(message));
                        debug('Message sent: ' + JSON.stringify(message));
                    });  
                };

                // send message to the bot
                var sendToBot = function (message, isAcknowledge) {
                    scrollBottom();

                    let timeSecs = Date.now() / 1000 | 0;
                    if(timeSecs - LAST_ACTIVITY_TIME >= 180) {
                        self.dispose();   
                    }
                    LAST_ACTIVITY_TIME = timeSecs;
                    if(isForceClosed) {
                        debug("*** Previous WebSocket down. Reconnecting...");
                        setTimeout(function () {
                            initWebSocket();
                            handleSendMsg(ws, message, isAcknowledge);
                        }, 300);
                    } else {
                        handleSendMsg(ws, message, isAcknowledge);
                    }
                }

                var retryTimes = 0;
                var waitForSocketConnection = function (socket, callback) {
                    if (socket && socket.readyState === 1) {
                        retryTimes = 0;
                        if(callback) {
                            callback();
                        }
                        return;
                    }

                    setTimeout(function () {
                        debug("waiting for connection...")
                        waitForSocketConnection(socket, callback);
                    }, 1000); // wait 1 second for the connection...
                }

                var debug = function (msg) {
                    console.log(msg);
                };

                self.onerror = function (error) {
                    console.error('WebSocket Error;', error);
                    self.dispose();
                };

                function scrollBottom(el, interval) {
                    interval = interval || 200;
                    setTimeout(function () {
                        // scroll down to the bottom
                        $(document).scrollTop($("#content").height());
                        console.log("scrolling",$("#content").height());
                        // $("#chatClientFooter").width($("#content").width());
                    }, interval);
                }

                ko.extenders.scrollFollow = function (target, selector) {
                    target.subscribe(function (newval) {
                        var el = document.querySelector(selector);
                        // check to see if you should scroll now?
                        //if (el.scrollTop == el.scrollHeight - el.clientHeight) {
                        scrollBottom(el);
                        //}
                    });
                    return target;
                };

                //self.dataSource = new oj.ArrayTableDataSource(self.allItems, {idAttribute: "id"})
                self.addItem = function (value, isBot, isNeedCache) {
                    isNeedCache = isNeedCache || true;
                    let isNormalState = true;
                    if(isBot) {
                        if(/^.*(session).*(expired).*(again).*$/i.test(value.text)) {
                            isNormalState = false;
                            debug("*** Session expiration detected...");
                            self.sendMessage(null, null, LAST_SENT_MSG);    
                        } else if(/^.*(Oops).*(encounter).*(trouble).*(again).*$/i.test(value.text)) {
                            isNormalState = false;
                            debug("*** Oops I'm encountering a spot of trouble detected...");
                            self.sendMessage(null, null, LAST_SENT_MSG);
                        }
                    } 

                    if(isNormalState) {
                        lastItemId++;
                        var item = {
                            id: lastItemId,
                            payload: value,
                            bot: isBot
                        };
                        self.allItems.push(item);

                        if(isNeedCache) {
                            self.operationStack.push(item);
                            while (self.operationStack.length > MAX_HISTORY_RECORDS) {
                                self.operationStack.shift();
                            }
                            localStorage.setItem("__operationStack", JSON.stringify(self.operationStack));
                        }
                    }
                };

                // this will be when typing!
                self.valueChangeHandler = function (context, ui) {
                    if(ui.option === "rawValue" && ui.value) {
                        if(ui.value.length % 3 === 1
                            && ui.value.length > ui.previousValue.length) {
                            $(document).scrollTop($("#content").height());
                        }
                    } 
                               
                    if (ui.option === "value") {
                        var valueObj = {
                            previousValue: ui.previousValue,
                            value: ui.value
                        };

                        // do only if enter!
                        if (context.keyCode === 13) {
                            // Free text is entered
                            messageToBot.messagePayload = {type: "text", text: valueObj.value};
                            self.addItem(valueObj.value, false);
                            self.value("");
                            sendToBot(messageToBot);
                        }
                    }
                };

                self.notSupportedMessage = ko.observable();

                // predefined selection!
                self.onClientSelection = function (action) {
                    self.addItem(action.label, false);
                    if (action.type === POSTBACK_TYPE) {
                        //messageToBot.messagePayload = {"type": "postback", "postback": action.postback};
                        // messageToBot.messagePayload = {"type": "text", "text": action.label};
                        // sendToBot(messageToBot);
                        self.sendMessage(null, null, action.label);
                    } else if (action.type === LOCATION_TYPE) {
                        if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition(function (position) {
                                messageToBot.messagePayload = {"type": 'location', location: {"latitude": position.coords.latitude, "longitude": position.coords.longitude}};
                                sendToBot(messageToBot);
                            });
                        } else {
                            self.notSupportedMessage('Geo location is not supported by this browser');
                            $("#notSupportedDialog").ojDialog("open");
                        }
                    } else {
                        self.notSupportedMessage('Action type ' + action.type + ' is not supported in tester');
                        $("#notSupportedDialog").ojDialog("open");
                    }
                };

                self.closeNotSupportedDialog = function () {
                    $("#notSupportedDialog").ojDialog("close");
                }

                // film trip properties!
                // self.currentNavArrowPlacement = ko.observable("adjacent");
                // self.currentNavArrowVisibility = ko.observable("auto");
                self.currentNavArrowPlacement = ko.observable("overlay");
                self.currentNavArrowVisibility = ko.observable("hidden");


                var isMob = self.isMobileDev();
                $(document).ready(function(){
                    setTimeout(function () {
                        if(isMob) {
                            $("#chatClientFooter").width($("#page").width());
                        }
                        $("#text-input").focus();
                    }, 200);
                })

            }
            return model;
        }
)