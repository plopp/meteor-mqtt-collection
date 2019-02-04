Package.describe({
  name: "plopp:mqtt-collection",
  version: "1.0.5",
  summary: "IoT for Meteor - send/receive MQTT messages via collections",
  git: "https://github.com/plopp/meteor-mqtt-collection.git",
  documentation: "README.md"
});

Npm.depends({
  "mqtt": "2.18.8"
});

Package.onUse(function(api) {
  api.versionsFrom("1.0");
  api.addFiles("lib/mqtt.js", "server");
  api.addFiles("lib/mqtt_collection.js", "server");
  api.export("mqtt");
});
