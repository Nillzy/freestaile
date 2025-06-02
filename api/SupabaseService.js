import { createClient } from '@supabase/supabase-js';


const supabase = createClient(`https://${process.env.SUPABASE_USER_ID}.supabase.co`, process.env.SUPABASE_API_KEY);

export async function fetchPresentation(presentationID) {
    const { data, error } = await supabase
        .from('Presentations')
        .select('topic, content')
        .eq('p_id', presentationID) //TODO: Check if user ID matches
        .single();

    if (error || !data || !data.topic || !data.content) {
        return false;
    } else {
        return { topic: data.topic, content: data.content };
    }
}

export async function saveSlides(presentationID, content, topic, roundID, accountID) {
    const { data, error } = await supabase
        .from('Presentations')
        .insert([
            { p_id: presentationID, content: content, topic: topic, r_id: roundID, a_id: accountID },
        ])
        .select()

    if (!error) {
        return true;
    } else {
        console.error("Presentation could not be saved. Reason: " + error.message);
        return false
    }
}

export async function getPresentationIDsFromRoundID(roundID) {
    const { data, error } = await supabase
        .from('Presentations_in_Round')
        .select('p_id')
        .eq('r_id', roundID);

    if (!error) {
        console.log(data);
        let presentationIDs = [];
        for (const i of data) {
            presentationIDs.push(i.p_id);
        }
        if (presentationIDs.length === 0) {
            return "INVALID_ROUND"
        }
        return presentationIDs;
    } else {
        console.error("Presentation IDs could not be fetched. Reason: " + error.message);
        return false
    }
}

export async function getRoundsFromAccountID(accountID) {
    const { data, error } = await supabase
        .from('Presentations_in_Round')
        .select('r_id, p_id, player, topic, created_at')
        .eq('a_id', accountID)
        .order('created_at', { ascending: false });

    if (!error) {
        // Gruppiere die Daten nach r_id
        const roundsMap = new Map();
        
        data.forEach(item => {
            if (!roundsMap.has(item.r_id)) {
                roundsMap.set(item.r_id, {
                    roundId: item.r_id,
                    createdAt: item.created_at,
                    presentations: []
                });
            }
            roundsMap.get(item.r_id).presentations.push({
                presentationId: item.p_id,
                player: item.player,
                topic: item.topic
            });
        });

        // Konvertiere Map zu Array
        const rounds = Array.from(roundsMap.values());
        console.log(rounds);
        return rounds;
    } else {
        console.error("Data could not be fetched. Reason: " + error.message);
        return false;
    }
}

export async function setPresentationIDsAndPlayersFromRoundID(presentationIDs, playersAndTopics, roundID, accountID) {

    for (let i = 0; i < presentationIDs.length; i++) {
        const { data, error } = await supabase
            .from('Presentations_in_Round')
            .insert({ p_id: presentationIDs[i], player: playersAndTopics[i].player, topic: playersAndTopics[i].topic, r_id: roundID, a_id: accountID })
            .select();

        if (error) {
            console.error("Presentation IDs could not be written to Presentations_in_Round. Reason: " + error.message);
            return false
        }
    }

    for (const presentationID of presentationIDs) {

    }
    return true;
}

export async function createRound(roundID, accountID) {
    const { data, error } = await supabase
        .from('Rounds')
        .insert([
            { r_id: roundID, a_id: accountID },
        ])
        .select()

    if (!error) {
        return true;
    } else {
        console.error("Round could not be created. Reason: " + error.message);
        return false;
    }
}

export async function fetchPlayerName(presentationID) {
    const { data, error } = await supabase
        .from('Presentations_in_Round')
        .select('player')
        .eq('p_id', presentationID) //TODO: Check if user ID matches
        .single();

    if (error || !data || !data.player) {
        return false;
    } else {
        return { player: data.player };
    }
}