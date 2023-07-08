const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const { threadId } = require('worker_threads');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://mail.google.com/'];

const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');


async function loadSavedCredentialsIfExist() {
    try {
        const content = await fs.readFile(TOKEN_PATH);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}


async function saveCredentials(client) {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, payload);
}


async function authorize() {
    let client = await loadSavedCredentialsIfExist();
    if (client) {
        return client;
    }
    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });
    if (client.credentials) {
        await saveCredentials(client);
    }
    return client;
}

const encodeMessage = (message) => {
    return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const createMail = async (options) => {
    const mailComposer = new MailComposer(options);
    const message = await mailComposer.compile().build();
    return encodeMessage(message);
};

const sendMail = async (options, gmail, threadId) => {
    const rawMessage = await createMail(options);
    const { data } = await gmail.users.messages.send({
        userId: 'me',
        resource: {
            raw: rawMessage,
            threadId: threadId,
        },
    });

    console.log(data)
};

function randomNumber(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}


async function listLabels(auth) {
    const gmail = google.gmail({ version: 'v1', auth });
    const res = await gmail.users.threads.list({
        userId: 'me',
    });
    res.data.threads.forEach(async ({ id }, index) => {
        const res1 = await gmail.users.threads.get({
            userId: 'me',
            id: id
        })
        if (res1.data.messages.filter(({ labelIds }) => labelIds.includes('SENT') || labelIds.includes('DRAFT')).length === 0) {
            const messageId = res1.data.messages[0].id
            const res2 = await gmail.users.messages.get({
                userId: 'me',
                id: messageId
            })

            let sender = res2.data.payload.headers.filter(({ name }) => name === 'From')[0].value;
            sender = sender.slice(
                sender.indexOf('<') + 1,
                sender.lastIndexOf('>'),
            )
            console.log(sender)
            const options = {
                to: sender,
                replyTo: sender,
                inReplyTo: messageId,
                subject: 'Status Update from Paras 🚀',
                text: 'This email is sent from the command line',
                html: `<p>🙋🏻‍♀️  &mdash; This is to inform you that I wont be able to reach out to you as I am busy in my vacations utill 16 December 2023.</p>`,
                textEncoding: 'base64',
            };

            const sentMessageId = await sendMail(options, gmail, res1.data.messages[0].threadId)
            if (sentMessageId) {
                console.log("Message Sent SuccessFully !!")
            }
        }
    })

}
authorize().then(listLabels).catch(console.error)
setInterval(() => authorize().then(listLabels).catch(console.error), randomNumber(50, 120) * 1000);

