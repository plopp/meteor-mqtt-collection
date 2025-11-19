

var Mongo = Package.mongo.Mongo;

Mongo.Collection.prototype.mqttConnect = function (uri, topics, options, mqttOptions) {
    var self = this;
    this.mqttDisconnect();

    this.options = options || {};
    this.mqttOptions = mqttOptions || {};

    this._mqttClient = mqtt.connect(uri, self.mqttOptions);

    this._mqttClient.on("connect", function () {
        self.mqttSubscribe(topics);
    });

    this._mqttClient.on("message", async function (topic, message) {
        var msg = message.toString();
        if (!self.options.raw) {
            try {
                msg = JSON.parse(msg);
            } catch (e) {
            }
        }

        if (self.options.insert) {
            try {
                await self.insertAsync({
                    topic: topic,
                    message: msg
                });

                if (self.options.insertLimit) {
                    var insertLimit = parseInt(self.options.insertLimit);
                    if (!isNaN(insertLimit)) {
                        while (await self.find({ topic: topic }).countAsync() > insertLimit) {
                            var removeId = await self.findOneAsync({ topic: topic }, { sort: [["createdAt", "asc"]] });
                            if (removeId) {
                                await self.removeAsync({ _id: removeId._id });
                            }
                        }
                    }
                }
            } catch (e) {
                console.log(e);
            }
        } else {
            try {
                await self.upsertAsync(
                    {
                        topic: topic
                    },
                    {
                        $set: {
                            topic: topic,
                            message: msg
                        }
                    },
                    {
                    }
                );
            } catch (e) {
                console.log(e);
            }
        }
    });

    var init = true;
    this.find().observeChanges({
        added: async function (id, doc) {
            if (!init) {
                if (doc && doc.topic && doc.message && doc.broadcast && self._mqttClient) {
                    var msg = typeof doc.message === 'object' ? JSON.stringify(doc.message) : doc.message + "";
                    await self.removeAsync({ _id: id });
                    self._mqttClient.publish(doc.topic, msg);
                }
            }
        }
    });
    init = false;
};

Mongo.Collection.prototype.mqttDisconnect = function () {
    if (this._mqttClient) this._mqttClient.end();
    this._mqttClient = null;
};

Mongo.Collection.prototype.mqttSubscribe = function (topics) {
    var self = this;
    if (!this._mqttClient) return;
    if (!topics) return;

    if (typeof topics == "string" || topics instanceof String) {
        this._mqttClient.subscribe(topics);
    } else if (_.isArray(topics)) {
        _.each(topics, function (topic) {
            self._mqttClient.subscribe(topic);
        });
    }
};