import { createClient } from '@supabase/supabase-js';


const supabase = createClient(`https://${process.env.SUPABASE_USER_ID}.supabase.co`, process.env.SUPABASE_API_KEY);

export async function fetchPresentation(presentationID) {
    const { data, error } = await supabase
        .from('Presentations')
        .select('topic, content')
        .eq('id', presentationID)
        .single();

    if (error || !data || !data.content) {
        return false;
    } else {
        return { topic: data.topic, content: data.content };
    }
}

export async function saveSlides(presentationID, content, topic) {
    const { data, error } = await supabase
        .from('Presentations')
        .insert([
            { id: presentationID, content: content, topic: topic },
        ])
        .select()

    if (!error) {
        return true;
    } else {
        console.error("Presentation could not be saved. Reason: " + error.message);
        return false
    }
}