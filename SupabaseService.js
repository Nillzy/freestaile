import { createClient } from '@supabase/supabase-js';

const supabase = createClient(`https://${process.env.SUPABASE_USER_ID}.supabase.co`, process.env.SUPABASE_API_KEY);

export async function fetchPresentation(presentationID) {
    const { data, error } = await supabase
        .from('Presentations')
        .select('content')
        .eq('id', presentationID)
        .single();

    if (error || !data || !data.content) {
        return "Presentation could not be fetched. Reason: " + error.message;
    } else {
        return data.content;
    }
}