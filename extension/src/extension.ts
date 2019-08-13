import * as vscode from 'vscode';
import * as languageClient from "vscode-languageclient";
import * as path from "path";
import * as fs from "fs";
import { isUndefined } from 'util';

const languageServerPath : string = "server/DenizenLangServer.dll";

const configuration : vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration();

function activateLanguageServer(context: vscode.ExtensionContext) {
    let pathFile : string = context.asAbsolutePath(languageServerPath);
    if (!fs.existsSync(pathFile)) {
        return;
    }
    let pathDir : string = path.dirname(pathFile);
    let serverOptions: languageClient.ServerOptions = {
        run: { command: "dotnet", args: [pathFile], options: { cwd: pathDir } },
        debug: { command: "dotnet", args: [pathFile, "--debug"], options: { cwd: pathDir } }
    }
    let clientOptions: languageClient.LanguageClientOptions = {
        documentSelector: ["denizenscript"],
        synchronize: {
            configurationSection: "DenizenLangServer",
        },
    }
    let client = new languageClient.LanguageClient("DenizenLangServer", "Denizen Language Server", serverOptions, clientOptions);
    let disposable = client.start();
    context.subscriptions.push(disposable);
}

const highlightDecors: { [color: string]: vscode.TextEditorDecorationType } = {};

function colorSet(name : string, incolor : string) {
    const colorSplit : string[] = incolor.split('\|');
    let resultColor : vscode.DecorationRenderOptions = { color : colorSplit[0] };
    for (const i in colorSplit) {
        const subValueSplit = colorSplit[i].split('=', 2);
        const subValueSetting = subValueSplit[0];
        if (subValueSetting == "style") {
            resultColor.fontStyle = subValueSplit[1];
        }
        else if (subValueSetting == "background") {
            resultColor.backgroundColor = subValueSplit[1];
        }
    }
    highlightDecors[name] = vscode.window.createTextEditorDecorationType(resultColor);
}

const colorTypes : string[] = [
    "comment_header", "comment_normal", "comment_code",
    "key", "key_inline", "command", "quote_double", "quote_single",
    "tag", "tag_dot", "tag_param", "bad_space"
];

function activateHighlighter(context: vscode.ExtensionContext) {
    for (const i in colorTypes) {
        let str : string = configuration.get("denizenscript.theme_colors." + colorTypes[i]);
        if (isUndefined(str)) {
            console.log("Missing color config for " + colorTypes[i]);
            continue;
        }
        colorSet(colorTypes[i], str);
    }
}

let refreshTimer: NodeJS.Timer | undefined = undefined;

function refreshDecor() {
    console.log('Denizen extension refreshing');
    refreshTimer = undefined;
    for (const editor of vscode.window.visibleTextEditors) {
        const uri = editor.document.uri.toString();
        if (!uri.endsWith(".dsc")) {
            continue;
        }
        decorateFullFile(editor);
    }
}

function addDecor(decorations: { [color: string]: vscode.Range[] }, type: string, lineNumber: number, startChar: number, endChar: number) {
    decorations[type].push(new vscode.Range(new vscode.Position(lineNumber, startChar), new vscode.Position(lineNumber, endChar)));
}

function decorateLine(line : string, lineNumber: number, decorations: { [color: string]: vscode.Range[] }) {
    const trimmedEnd : string = line.trimRight();
    if (trimmedEnd.length != line.length) {
        addDecor(decorations, "bad_space", lineNumber, trimmedEnd.length, line.length);
    }
    const trimmed : string = trimmedEnd.trimLeft();
    const len : number = line.length;
    for (let i : number = 0; i < len; i++) {
        let c : string = line.charAt(i);
        if (c == '"') {
            decorations["quote_double"].push(new vscode.Range(new vscode.Position(lineNumber, i - 1), new vscode.Position(lineNumber, i + 1)));
        }
        if (c == '\'') {
            decorations["command"].push(new vscode.Range(new vscode.Position(lineNumber, i - 1), new vscode.Position(lineNumber, i + 1)));
        }
    }
}

function decorateFullFile(editor: vscode.TextEditor) {
    let decorations: { [color: string]: vscode.Range[] } = {};
    for (const c in highlightDecors) {
        decorations[c] = [];
    }
    const fullText : string = editor.document.getText();
    const splitText : string[] = fullText.split('\n');
    const totalLines = splitText.length;
    for (let i : number = 0; i < totalLines; i++) {
        decorateLine(splitText[i], i, decorations);
    }
    for (const c in decorations) {
        editor.setDecorations(highlightDecors[c], decorations[c]);
    }
}

function scheduleRefresh() {
    if (refreshTimer) {
        return;
    }
    refreshTimer = setTimeout(refreshDecor, 50);
}

export function activate(context: vscode.ExtensionContext) {
    activateLanguageServer(context);
    activateHighlighter(context);
    vscode.workspace.onDidOpenTextDocument(doc => {
        if (doc.uri.toString().endsWith(".dsc")) {
            scheduleRefresh();
        }
    }, null, context.subscriptions);
    vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri.toString().endsWith(".dsc")) {
            scheduleRefresh();
        }
    }, null, context.subscriptions);
    vscode.window.onDidChangeVisibleTextEditors(editors => {
        scheduleRefresh();
    }, null, context.subscriptions);
    scheduleRefresh();
    console.log('Denizen extension has been activated');
}

export function deactivate() {
}
