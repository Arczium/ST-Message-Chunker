import { extension_settings, renderExtensionTemplate } from "../../../extensions.js";
import { getTokenCount } from "../../../tokenizers.js";
import { saveSettingsDebounced, eventSource, event_types, chat_metadata } from "../../../../script.js";

const extensionName = "ST-Message-Chunker";

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

    const settingsHtml = await renderExtensionTemplate('third-party/ST-Message-Chunker', 'settings');
  
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
    if (settings.mode === 'off' || typeof chat_metadata === 'undefined') return;

    let anchorDate = chat_metadata['mchunker_anchor_date'] || 0;
    
    for (let i = chatCopy.length - 1; i >= 0; i--) {
        const msg = chatCopy[i];
        
        // Skip system prompts, character defs, and injected vectors (which usually lack a send_date or use is_system)
        if (msg.is_system || !msg.send_date) continue;

        if (msg.send_date < anchorDate) {
            chatCopy.splice(i, 1);
        }
    }

    if (settings.mode === 'messages') {
        anchorDate = modusMaxMessages(chatCopy, anchorDate);
    } else if (settings.mode === 'tokens') {
        anchorDate = modusMaxTokens(chatCopy, anchorDate); 
    }

    chat_metadata['mchunker_anchor_date'] = anchorDate;
}

function modusMaxMessages(chatCopy, anchorDate) {
    const maxAllowed = settings.minMessages + settings.chunkSize;
    
    const historyMsgs = chatCopy.filter(m => !m.is_system && m.send_date);

    if (historyMsgs.length > maxAllowed) {
        console.log(`[ST Message Chunker] Splicing ${settings.chunkSize} messages...`);
        
        const messagesToDrop = historyMsgs.slice(0, settings.chunkSize);
        
        const firstKept = historyMsgs[settings.chunkSize];
        if (firstKept && firstKept.send_date) {
            anchorDate = firstKept.send_date;
        }

        for (const msg of messagesToDrop) {
            const index = chatCopy.indexOf(msg);
            if (index !== -1) chatCopy.splice(index, 1);
        }
    }
    return anchorDate; 
}

function getChatTokens(chatArray) {
    const chatString = chatArray.map(message => message.mes).join('\n');
    return getTokenCount(chatString);
}

function modusMaxTokens(chatCopy, anchorDate) {
    let currentTokens = getChatTokens(chatCopy);
    console.log(`[ST Message Chunker] [Token Mode] Initial tokens evaluated at: ${currentTokens}. Target max: ${settings.maxTokens}`);
    
    while (currentTokens > settings.maxTokens) {
        const historyMsgs = chatCopy.filter(m => !m.is_system && m.send_date);

          if (historyMsgs.length <= settings.chunkSize) {
            console.log(`[ST Message Chunker] [Token Mode] Chat length too small to chunk further. Breaking loop.`);
            break;
        }
        
        console.log(`[ST Message Chunker] [Token Mode] Tokens (${currentTokens}) > Max (${settings.maxTokens}). Splicing ${settings.chunkSize} messages...`);
        
        const messagesToDrop = historyMsgs.slice(0, settings.chunkSize);
        
        const firstKept = historyMsgs[settings.chunkSize];
        if (firstKept && firstKept.send_date) {
            anchorDate = firstKept.send_date;
        }

        for (const msg of messagesToDrop) {
            const index = chatCopy.indexOf(msg);
            if (index !== -1) {
                chatCopy.splice(index, 1);
            }
        }
        
        currentTokens = getChatTokens(chatCopy);
    }

    const logMsg = `Finished loop. New Anchor: ${anchorDate} | Sent Messages: ${chatCopy.length} | Final Tokens: ${currentTokens}`;
    console.log(`[ST Message Chunker] [Token Mode] ${logMsg}`);
    
    return anchorDate;
}

window['MessageChunker_trimContext'] = trimContext;

jQuery(async () => {
    await initExtension();
});