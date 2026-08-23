import { extension_settings, renderExtensionTemplate } from "../../../extensions.js";
import { getTokenCount } from "../../../tokenizers.js";
import { saveSettingsDebounced, eventSource, event_types, chat_metadata } from "../../../../script.js";

const extensionName = "st-message-chunker";

const defaultSettings = {
    mode: 'messages',
    chunkSize: 10,
    minMessages: 30,
    maxTokens: 6000
};

let settings = {};

function updateUI() {
    console.log(`[ST Message Chunker] Updating interface. Current mode: ${$('#mchunker_mode').val()}`);
    $('#mchunker_messages_container').hide();
    $('#mchunker_tokens_container').hide();
    $('#mchunker_chunk_container').hide(); 
    
    const mode = $('#mchunker_mode').val();
    
    if (mode !== 'off') {
        $('#mchunker_chunk_container').show(); 
    }

    if (mode === 'messages') {
        $('#mchunker_messages_container').show();
        
        const minMsg = Number($('#mchunker_min_messages').val());
        const chunk = Number($('#mchunker_chunk_size').val());
        $('#mchunker_max_messages_display').text(minMsg + chunk);
    } else if (mode === 'tokens') {
        $('#mchunker_tokens_container').show();
    }
}

async function initExtension() {
     console.log(`[ST Message Chunker] Starting extension initialization...`);
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = {};
    }
    
    settings = Object.assign({}, defaultSettings, extension_settings[extensionName]);

    const settingsHtml = await renderExtensionTemplate('third-party/st-message-chunker', 'settings');
    //const settingsHtml = await renderExtensionTemplate('st-message-chunker', 'settings');

    $('#extensions_settings2').append(settingsHtml);

    $('#mchunker_mode').val(settings.mode);
    $('#mchunker_chunk_size').val(settings.chunkSize);
    $('#mchunker_min_messages').val(settings.minMessages);
    $('#mchunker_max_tokens').val(settings.maxTokens);

    updateUI();

    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, function (chatCopy) {
        console.log(`[ST Message Chunker] Intercepted GENERATE_BEFORE_COMBINE_PROMPTS!`);
        
          if (chatCopy && chatCopy.length !== undefined) {
            trimContext(chatCopy);
        } else {
            console.log(`[ST Message Chunker] Error: Valid chat array not found! Data looks like:`, chatCopy);
        }
    });

    $('#mchunker_mode').on('change', function () {
        settings.mode = $(this).val();
        extension_settings[extensionName] = settings;
        saveSettingsDebounced();
        updateUI();
    });

    $('#mchunker_chunk_size, #mchunker_min_messages, #mchunker_max_tokens').on('input', function () {
        settings.chunkSize = Number($('#mchunker_chunk_size').val());
        settings.minMessages = Number($('#mchunker_min_messages').val());
        settings.maxTokens = Number($('#mchunker_max_tokens').val());
        
        extension_settings[extensionName] = settings;
        saveSettingsDebounced();
        updateUI();
    });
    
    console.log(`[ST Message Chunker]Initialization finished successfully.`);
}

function trimContext(chatCopy) {
    console.log(`[ST Message Chunker] Received chat array with ${chatCopy.length} messages.`);

    if (settings.mode === 'off') {
        console.log(`[ST Message Chunker] Mode is OFF. Aborting trim.`);
        return;
    }
    
    if (typeof chat_metadata === 'undefined') {
        console.log(`[ST Message Chunker] ERROR: chat_metadata is missing! Cannot track offset. Aborting.`);
        return; 
    }
    
    let offset = chat_metadata['mchunker_offset'] || 0;
    console.log(`[ST Message Chunker] Loaded current chat offset from metadata: ${offset}`);
    
    if (offset > 0) {
        console.log(`[ST Message Chunker] Processing initial offset...`);
        if (offset >= chatCopy.length) {
            console.log(`[ST Message Chunker] Offset (${offset}) is larger than chat size (${chatCopy.length}). Resetting offset to 0.`);
            offset = 0; 
        } else {
            chatCopy.splice(0, offset); 
            console.log(`[ST Message Chunker] Chat length is now: ${chatCopy.length}`);
        }
    } else {
        console.log(`[ST Message Chunker] Offset is 0. Skipping initial splice.`);
    }

    if (settings.mode === 'messages') {
        console.log(`[ST Message Chunker] Handing over to Message Mode logic...`);
        offset = modusMaxMessages(chatCopy, offset);
    } else if (settings.mode === 'tokens') {
        console.log(`[ST Message Chunker] Handing over to Token Mode logic...`);
        offset = modusMaxTokens(chatCopy, offset); 
    }

    console.log(`[ST Message Chunker] Saving final calculated offset (${offset}) back to metadata.`);
    chat_metadata['mchunker_offset'] = offset;
}

function modusMaxMessages(chatCopy, offset) {
    const maxAllowed = settings.minMessages + settings.chunkSize;
    console.log(`[ST Message Chunker] [Message Mode] Max allowed messages set to: ${maxAllowed}`);

    while (chatCopy.length > maxAllowed) {
        console.log(`[ST Message Chunker] [Message Mode] Chat length (${chatCopy.length}) > Max (${maxAllowed}). Splicing ${settings.chunkSize} messages...`);
        chatCopy.splice(0, settings.chunkSize);
        offset += settings.chunkSize;
    }

    const logMsg = `Finished loop. New Offset: ${offset} | Final Sent Messages: ${chatCopy.length}`;
    console.log(`[ST Message Chunker] [Message Mode] ${logMsg}`);
       
    return offset; 
}

function getChatTokens(chatArray) {
    const chatString = chatArray.map(message => message.mes).join('\n');
    return getTokenCount(chatString);
}

function modusMaxTokens(chatCopy, offset) {
    let currentTokens = getChatTokens(chatCopy);
    console.log(`[ST Message Chunker] [Token Mode] Initial tokens evaluated at: ${currentTokens}. Target max: ${settings.maxTokens}`);
    
    while (currentTokens > settings.maxTokens) {
        if (chatCopy.length <= settings.chunkSize) {
            console.log(`[ST Message Chunker] [Token Mode] Chat length too small to chunk further. Breaking loop.`);
            break;
        }
        console.log(`[ST Message Chunker] [Token Mode] Tokens (${currentTokens}) > Max (${settings.maxTokens}). Splicing ${settings.chunkSize} messages...`);
        chatCopy.splice(0, settings.chunkSize);
        offset += settings.chunkSize;
        currentTokens = getChatTokens(chatCopy);
    }

    const logMsg = `Finished loop. New Offset: ${offset} | Sent Messages: ${chatCopy.length} | Final Tokens: ${currentTokens}`;
    console.log(`[ST Message Chunker] [Token Mode] ${logMsg}`);
    
    return offset;
}

window['MessageChunker_trimContext'] = trimContext;

jQuery(async () => {
    await initExtension();
});