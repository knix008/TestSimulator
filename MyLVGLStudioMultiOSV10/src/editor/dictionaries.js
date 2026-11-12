// The dictionaries' files, bundled with the app and fetched when spell checking first needs them.
// The packages export only their index.js, so the files are imported by path.
import koAff from "../../node_modules/dictionary-ko/index.aff?url";
import koDic from "../../node_modules/dictionary-ko/index.dic?url";
import enAff from "../../node_modules/dictionary-en/index.aff?url";
import enDic from "../../node_modules/dictionary-en/index.dic?url";

const FILES = { ko: { aff: koAff, dic: koDic }, en: { aff: enAff, dic: enDic } };

/** { aff, dic } of a language, as bytes. */
export async function dictionaryFiles(language) {
  const urls = FILES[language];
  if (!urls) throw new Error(`no dictionary for ${language}`);
  const bytes = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());
  const [aff, dic] = await Promise.all([bytes(urls.aff), bytes(urls.dic)]);
  return { aff, dic };
}
