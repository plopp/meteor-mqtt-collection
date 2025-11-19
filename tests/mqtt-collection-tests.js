import { Mongo } from 'meteor/mongo';
import { expect } from 'chai';
import EventEmitter from 'events';

describe('MQTT Collection', function () {
    let TestCollection;
    let mockMqttClient;

    // Helper to create a mock MQTT client
    function createMockMqttClient() {
        const client = new EventEmitter();
        client.subscribe = function (topic) {
            // Mock subscribe - just store it
            this.subscribedTopics = this.subscribedTopics || [];
            this.subscribedTopics.push(topic);
        };
        client.publish = function (topic, message) {
            // Mock publish - store published messages
            this.publishedMessages = this.publishedMessages || [];
            this.publishedMessages.push({ topic, message });
        };
        client.end = function () {
            this.ended = true;
        };
        return client;
    }

    beforeEach(function () {
        // Create a fresh test collection for each test
        TestCollection = new Mongo.Collection('test_mqtt_' + Date.now());

        // Mock the mqtt.connect function to return our mock client
        mockMqttClient = createMockMqttClient();
        const originalConnect = mqtt.connect;
        mqtt.connect = function () {
            return mockMqttClient;
        };

        // Store original for cleanup
        this.originalConnect = originalConnect;
    });

    afterEach(function () {
        // Restore original mqtt.connect
        if (this.originalConnect) {
            mqtt.connect = this.originalConnect;
        }

        // Disconnect and clean up
        if (TestCollection) {
            TestCollection.mqttDisconnect();
        }
    });

    describe('Insert Mode', function () {
        it('should insert a new document when MQTT message is received', async function () {
            // Connect with insert mode
            TestCollection.mqttConnect('mqtt://test.broker', ['test/topic'], { insert: true });

            // Simulate connection
            mockMqttClient.emit('connect');

            // Verify subscription
            expect(mockMqttClient.subscribedTopics).to.include('test/topic');

            // Simulate receiving a message
            const testMessage = { data: 'test value' };
            await mockMqttClient.emit('message', 'test/topic', Buffer.from(JSON.stringify(testMessage)));

            // Wait a bit for async operations to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify the document was inserted
            const docs = await TestCollection.find({ topic: 'test/topic' }).fetchAsync();
            expect(docs).to.have.lengthOf(1);
            expect(docs[0].topic).to.equal('test/topic');
            expect(docs[0].message).to.deep.equal(testMessage);
        });

        it('should insert multiple documents for multiple messages', async function () {
            TestCollection.mqttConnect('mqtt://test.broker', ['test/topic'], { insert: true });
            mockMqttClient.emit('connect');

            // Send multiple messages
            await mockMqttClient.emit('message', 'test/topic', Buffer.from(JSON.stringify({ id: 1 })));
            await mockMqttClient.emit('message', 'test/topic', Buffer.from(JSON.stringify({ id: 2 })));
            await mockMqttClient.emit('message', 'test/topic', Buffer.from(JSON.stringify({ id: 3 })));

            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify all documents were inserted
            const docs = await TestCollection.find({ topic: 'test/topic' }).fetchAsync();
            expect(docs).to.have.lengthOf(3);
        });

        it('should enforce insertLimit by removing oldest documents', async function () {
            TestCollection.mqttConnect('mqtt://test.broker', ['test/topic'], {
                insert: true,
                insertLimit: 2
            });
            mockMqttClient.emit('connect');

            // Insert 3 messages when limit is 2
            await mockMqttClient.emit('message', 'test/topic', Buffer.from(JSON.stringify({ id: 1 })));
            await new Promise(resolve => setTimeout(resolve, 50));

            await mockMqttClient.emit('message', 'test/topic', Buffer.from(JSON.stringify({ id: 2 })));
            await new Promise(resolve => setTimeout(resolve, 50));

            await mockMqttClient.emit('message', 'test/topic', Buffer.from(JSON.stringify({ id: 3 })));
            await new Promise(resolve => setTimeout(resolve, 100));

            // Should only have 2 documents (oldest removed)
            const docs = await TestCollection.find({ topic: 'test/topic' }).fetchAsync();
            expect(docs).to.have.lengthOf(2);

            // First message should be gone, should have messages 2 and 3
            const ids = docs.map(d => d.message.id).sort();
            expect(ids).to.deep.equal([2, 3]);
        });

        it('should handle raw messages when raw option is true', async function () {
            TestCollection.mqttConnect('mqtt://test.broker', ['test/topic'], {
                insert: true,
                raw: true
            });
            mockMqttClient.emit('connect');

            const rawMessage = 'plain text message';
            await mockMqttClient.emit('message', 'test/topic', Buffer.from(rawMessage));
            await new Promise(resolve => setTimeout(resolve, 100));

            const docs = await TestCollection.find({ topic: 'test/topic' }).fetchAsync();
            expect(docs).to.have.lengthOf(1);
            expect(docs[0].message).to.equal(rawMessage);
        });

        it('should handle invalid JSON gracefully', async function () {
            TestCollection.mqttConnect('mqtt://test.broker', ['test/topic'], { insert: true });
            mockMqttClient.emit('connect');

            // Send invalid JSON (without raw mode)
            const invalidJson = '{invalid json}';
            await mockMqttClient.emit('message', 'test/topic', Buffer.from(invalidJson));
            await new Promise(resolve => setTimeout(resolve, 100));

            // Should still insert, but message will be the string itself
            const docs = await TestCollection.find({ topic: 'test/topic' }).fetchAsync();
            expect(docs).to.have.lengthOf(1);
            expect(docs[0].message).to.equal(invalidJson);
        });
    });

    describe('Upsert Mode', function () {
        it('should upsert a document when MQTT message is received', async function () {
            // Connect without insert mode (default is upsert)
            TestCollection.mqttConnect('mqtt://test.broker', ['test/topic']);
            mockMqttClient.emit('connect');

            // Simulate receiving a message
            const testMessage = { data: 'test value' };
            await mockMqttClient.emit('message', 'test/topic', Buffer.from(JSON.stringify(testMessage)));
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify the document was upserted
            const docs = await TestCollection.find({ topic: 'test/topic' }).fetchAsync();
            expect(docs).to.have.lengthOf(1);
            expect(docs[0].topic).to.equal('test/topic');
            expect(docs[0].message).to.deep.equal(testMessage);
        });

        it('should update the same document for multiple messages to same topic', async function () {
            TestCollection.mqttConnect('mqtt://test.broker', ['test/topic']);
            mockMqttClient.emit('connect');

            // Send multiple messages to same topic
            await mockMqttClient.emit('message', 'test/topic', Buffer.from(JSON.stringify({ value: 1 })));
            await new Promise(resolve => setTimeout(resolve, 50));

            await mockMqttClient.emit('message', 'test/topic', Buffer.from(JSON.stringify({ value: 2 })));
            await new Promise(resolve => setTimeout(resolve, 50));

            await mockMqttClient.emit('message', 'test/topic', Buffer.from(JSON.stringify({ value: 3 })));
            await new Promise(resolve => setTimeout(resolve, 100));

            // Should only have 1 document (upserted)
            const docs = await TestCollection.find({ topic: 'test/topic' }).fetchAsync();
            expect(docs).to.have.lengthOf(1);
            expect(docs[0].message.value).to.equal(3); // Latest value
        });

        it('should create separate documents for different topics', async function () {
            TestCollection.mqttConnect('mqtt://test.broker', ['topic1', 'topic2']);
            mockMqttClient.emit('connect');

            await mockMqttClient.emit('message', 'topic1', Buffer.from(JSON.stringify({ source: 'topic1' })));
            await mockMqttClient.emit('message', 'topic2', Buffer.from(JSON.stringify({ source: 'topic2' })));
            await new Promise(resolve => setTimeout(resolve, 100));

            const docs = await TestCollection.find({}).fetchAsync();
            expect(docs).to.have.lengthOf(2);

            const topic1Doc = docs.find(d => d.topic === 'topic1');
            const topic2Doc = docs.find(d => d.topic === 'topic2');

            expect(topic1Doc.message.source).to.equal('topic1');
            expect(topic2Doc.message.source).to.equal('topic2');
        });
    });

    describe('Broadcast Functionality', function () {
        it('should publish to MQTT when document with broadcast flag is inserted', async function () {
            TestCollection.mqttConnect('mqtt://test.broker', ['test/topic']);
            mockMqttClient.emit('connect');

            // Wait for observeChanges to initialize
            await new Promise(resolve => setTimeout(resolve, 100));

            // Insert a document with broadcast flag
            const broadcastMessage = { data: 'broadcast this' };
            await TestCollection.insertAsync({
                topic: 'outgoing/topic',
                message: broadcastMessage,
                broadcast: true
            });

            // Wait for the broadcast to process
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify the message was published
            expect(mockMqttClient.publishedMessages).to.have.lengthOf(1);
            expect(mockMqttClient.publishedMessages[0].topic).to.equal('outgoing/topic');
            expect(mockMqttClient.publishedMessages[0].message).to.equal(JSON.stringify(broadcastMessage));
        });

        it('should handle string messages for broadcast', async function () {
            TestCollection.mqttConnect('mqtt://test.broker', ['test/topic']);
            mockMqttClient.emit('connect');
            await new Promise(resolve => setTimeout(resolve, 100));

            // Insert with string message
            await TestCollection.insertAsync({
                topic: 'outgoing/topic',
                message: 'simple string',
                broadcast: true
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(mockMqttClient.publishedMessages).to.have.lengthOf(1);
            expect(mockMqttClient.publishedMessages[0].message).to.equal('simple string');
        });

        it('should remove broadcast document after publishing', async function () {
            TestCollection.mqttConnect('mqtt://test.broker', ['test/topic']);
            mockMqttClient.emit('connect');
            await new Promise(resolve => setTimeout(resolve, 100));

            const insertId = await TestCollection.insertAsync({
                topic: 'outgoing/topic',
                message: { data: 'test' },
                broadcast: true
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            // Document should be removed after broadcast
            const doc = await TestCollection.findOneAsync({ _id: insertId });
            expect(doc).to.be.undefined;
        });
    });

    describe('Connection Management', function () {
        it('should subscribe to single topic on connect', function () {
            TestCollection.mqttConnect('mqtt://test.broker', 'single/topic');
            mockMqttClient.emit('connect');

            expect(mockMqttClient.subscribedTopics).to.include('single/topic');
        });

        it('should subscribe to multiple topics on connect', function () {
            TestCollection.mqttConnect('mqtt://test.broker', ['topic1', 'topic2', 'topic3']);
            mockMqttClient.emit('connect');

            expect(mockMqttClient.subscribedTopics).to.have.lengthOf(3);
            expect(mockMqttClient.subscribedTopics).to.include.members(['topic1', 'topic2', 'topic3']);
        });

        it('should disconnect properly', function () {
            TestCollection.mqttConnect('mqtt://test.broker', 'test/topic');
            TestCollection.mqttDisconnect();

            expect(mockMqttClient.ended).to.be.true;
        });

        it('should disconnect old client when connecting again', function () {
            TestCollection.mqttConnect('mqtt://test.broker', 'test/topic');
            const firstClient = mockMqttClient;

            // Create new mock for second connection
            mockMqttClient = createMockMqttClient();
            TestCollection.mqttConnect('mqtt://test.broker', 'test/topic');

            expect(firstClient.ended).to.be.true;
        });
    });
});
