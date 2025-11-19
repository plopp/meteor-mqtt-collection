Package.describe({
    name: "plopp:mqtt-collection",
    version: "1.0.5",
    summary: "IoT for Meteor - send/receive MQTT messages via collections",
    git: "https://github.com/plopp/meteor-mqtt-collection.git",
    documentation: "README.md"
});

Npm.depends({
    "mqtt": "4.2.5",
    "chai": "4.3.10"
});

Package.onUse(function (api) {
    api.versionsFrom("1.0");
    api.use("underscore");
    api.addFiles("lib/mqtt.js", "server");
    api.addFiles("lib/mqtt_collection.js", "server");
    api.export("mqtt");
});

Package.onTest(function (api) {
    api.use("ecmascript");
    api.use("mongo");
    api.use("plopp:mqtt-collection");
    api.use("meteortesting:mocha");
    api.mainModule("tests/mqtt-collection-tests.js", "server");
});
