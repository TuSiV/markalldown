import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from redaction import redact_markdown, encrypt_mapping, decrypt_mapping, restore_markdown, seal_payload
from recovery import documents_from_vaults, build_pack, preview_recovery, digest

class TestRedaction(unittest.TestCase):
    def test_roundtrip_and_repeated_identity(self):
        source = '张三联系 13800138000 和 13800138000，邮箱 abc@example.com。'
        masked, mapping, summary = redact_markdown(source, {"keywords": ["张三"]})
        self.assertNotIn('张三', masked)
        self.assertNotIn('13800138000', masked)
        self.assertEqual(summary['occurrences'], 4)
        self.assertEqual(len(mapping), 3)
        vault = encrypt_mapping(mapping, 'correct horse battery')
        self.assertNotIn('13800138000', str(vault))
        self.assertEqual(restore_markdown(masked, [vault], 'correct horse battery')[0], source)

    def test_short_english_tokens_and_legacy_recovery(self):
        masked, mapping, _ = redact_markdown('13800138000 张三 13800138000', {"keywords": ["张三"]}, 'abcdef01' + '0' * 24)
        self.assertEqual(masked, '【PHONE_abcdef01_01】 【TERM_abcdef01_01】 【PHONE_abcdef01_01】')
        old = '【MAD_' + 'a' * 32 + '_PHONE_0001】'
        vault = encrypt_mapping({old: '13800138000'}, 'a long passphrase')
        self.assertEqual(restore_markdown(old, [vault], 'a long passphrase')[0], '13800138000')

    def test_short_namespace_collision_refused_even_for_same_original(self):
        vaults = []
        for suffix in ('0', '1'):
            pid = 'abcdef01' + suffix * 24
            _, mapping, _ = redact_markdown('13800138000', {}, pid)
            document = {'documentId': suffix * 32, 'processingId': pid,
                        'sourceHash': 'a' * 64, 'redactedHash': 'b' * 64, 'mapping': mapping}
            vaults.append(seal_payload(document, 'a long passphrase', 'MAD-R2'))
        with self.assertRaisesRegex(ValueError, 'Conflicting'):
            documents_from_vaults(vaults, 'a long passphrase')
        with self.assertRaisesRegex(ValueError, 'Conflicting'):
            restore_markdown('【PHONE_abcdef01_01】', vaults, 'a long passphrase')

    def test_short_token_excerpt_identifies_document(self):
        pid = 'abcdef01' + '0' * 24
        source = '13800138000 13900139000'
        masked, mapping, _ = redact_markdown(source, {}, pid)
        document = {'documentId': 'a' * 32, 'processingId': pid,
                    'sourceHash': digest(source), 'redactedHash': digest(masked), 'mapping': mapping}
        pack = build_pack([seal_payload(document, 'a long passphrase', 'MAD-R2')], 'a long passphrase')
        result = preview_recovery('【PHONE_abcdef01_01】', pack, 'a long passphrase')
        self.assertEqual(result['content'], '13800138000')
        self.assertEqual(result['integrity'], 'edited')
        self.assertEqual(result['processingIds'], [pid])

    def test_whitelist_and_nested(self):
        masked, mapping, _ = redact_markdown('13800138000 13900139000', {"whitelist": ["13800138000"]})
        self.assertIn('13800138000', masked)
        self.assertNotIn('13900139000', masked)
        self.assertEqual(len(mapping), 1)

    def test_custom_overlapping_phone(self):
        masked, mapping, summary = redact_markdown('13800138000', {"keywords": ["13800138000"]})
        self.assertEqual(summary['occurrences'], 1)
        self.assertEqual(len(mapping), 1)

    def test_combine_multiple_vaults(self):
        first, m1, _ = redact_markdown('13800138000', {})
        second, m2, _ = redact_markdown('13900139000', {})
        result, n = restore_markdown(first+'\n'+second,[encrypt_mapping(m1,'my secret pass'),encrypt_mapping(m2,'my secret pass')],'my secret pass')
        self.assertEqual(n, 2)
        self.assertEqual(result, '13800138000\n13900139000')

    def test_wrong_passphrase_fails(self):
        v = encrypt_mapping({'【MAD_test_PHONE_0001】':'abc'},'the good pass')
        with self.assertRaises(ValueError):
            decrypt_mapping(v,'the wrong pass')

    def test_literal_restoration_not_cascading(self):
        source = '13800138000 and 13900139000'
        masked, mapping, _ = redact_markdown(source,{})
        vault = encrypt_mapping(mapping,'super secret!')
        restored, n = restore_markdown(masked,[vault],'super secret!')
        self.assertEqual(restored,source)
        self.assertEqual(n,2)

    def test_never_confuse_pattern_or_whitelisted_substring(self):
        source = '账户：6222020202020202020, 合同号 2026-1'
        masked, m, s = redact_markdown(source,{"categories":["bank_account"]})
        self.assertEqual(s['occurrences'],1)
        self.assertIn('账户：', masked)
        self.assertNotIn('6222020202020202020', masked)

    def test_optional_legal_and_financial_categories(self):
        text = '案号：（2025）鲁1103执1870号，合同编号：CS2026-008；日期2026年10月11日；人民币2,300万元。'
        masked, mapping, summary = redact_markdown(text, {"categories": ["case_number", "file_code", "date", "amount"]})
        self.assertEqual(summary["occurrences"], 4)
        self.assertEqual(restore_markdown(masked, [encrypt_mapping(mapping, 'a secure password')], 'a secure password')[0], text)

    def test_already_redacted_tokens_are_not_modified(self):
        masked, _, _ = redact_markdown('13800138000', {})
        twice, mapping2, summary2 = redact_markdown(masked, {})
        self.assertEqual(twice, masked)
        self.assertEqual(mapping2, {})
        self.assertEqual(summary2['occurrences'], 0)

    def test_restore_mismatched_vault_refuses_silent_success(self):
        masked, _, _ = redact_markdown('13800138000', {})
        _, other_map, _ = redact_markdown('13900139000', {})
        vault = encrypt_mapping(other_map, 'a long passphrase')
        with self.assertRaises(ValueError):
            restore_markdown(masked, [vault], 'a long passphrase')

    def test_restore_unknown_placeholder_refuses_silent_success(self):
        first, mapping, _ = redact_markdown('13800138000', {})
        second, _, _ = redact_markdown('13900139000', {})
        with self.assertRaises(ValueError):
            restore_markdown(first + ' ' + second, [encrypt_mapping(mapping, 'a long passphrase')], 'a long passphrase')

    def test_restore_partial_document_allowed(self):
        first, mapping, _ = redact_markdown('13800138000 13900139000', {})
        one = first.split()[0]
        restored, n = restore_markdown(one, [encrypt_mapping(mapping, 'a long passphrase')], 'a long passphrase')
        self.assertEqual(restored, '13800138000')
        self.assertEqual(n, 1)

    def test_disabled_categories(self):
        text='13800138000 abc@xyz.com'
        masked, _, stats=redact_markdown(text,{"categories":[],"keywords":[]})
        self.assertEqual(masked,text)
        self.assertEqual(stats['occurrences'],0)

if __name__=='__main__': unittest.main()
