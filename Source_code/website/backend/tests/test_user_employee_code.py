"""Exercise user endpoints without loading camera models or a real database."""
import ast
from pathlib import Path
import unittest
from unittest.mock import MagicMock

from flask import Flask, jsonify, request


class EmployeeCodeTests(unittest.TestCase):
    def setUp(self):
        source = Path(__file__).resolve().parents[1] / 'app.py'
        tree = ast.parse(source.read_text(encoding='utf-8-sig'))
        functions = []
        for node in tree.body:
            if isinstance(node, ast.FunctionDef) and node.name in ('add_user', 'update_user_api', 'get_users'):
                node.decorator_list = []
                functions.append(node)
        self.app = Flask(__name__)
        self.conn = MagicMock()
        self.cursor = self.conn.cursor.return_value
        self.cursor.fetchone.return_value = (1,)
        self.env = dict(request=request, jsonify=jsonify,
                        get_db_connection=MagicMock(return_value=self.conn),
                        validate_password=lambda p: (True, ''), hash_password=lambda p: 'hashed')
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), 'exec'), self.env)

    def call(self, name, data, *args):
        with self.app.test_request_context(json=data):
            result = self.env[name](*args)
            return result if isinstance(result, tuple) else (result, 200)

    def test_create_leaves_code_generation_to_database(self):
        _, status = self.call('add_user', dict(username='guard', password='valid-password', employee_code='9999'))
        self.assertEqual(status, 200)
        inserts = [c for c in self.cursor.execute.call_args_list if 'INSERT INTO users' in c.args[0]]
        self.assertNotIn('employee_code', inserts[0].args[0])
        self.assertEqual(len(inserts[0].args[1]), 3)
        self.conn.commit.assert_called_once()

    def test_manual_code_update_is_ignored(self):
        _, status = self.call('update_user_api', {'employee_code': '9999'}, 7)
        self.assertEqual(status, 200)
        self.assertFalse(any('employee_code = ' in c.args[0] for c in self.cursor.execute.call_args_list))

    def test_duplicate_rolls_back_and_closes(self):
        def execute(sql, *args):
            if sql.startswith('UPDATE users'):
                raise Exception('2601 UX_users_employee_code')
        self.cursor.execute.side_effect = execute
        _, status = self.call('update_user_api', {'password': 'valid-password'}, 7)
        self.assertEqual(status, 409)
        self.conn.rollback.assert_called_once()
        self.conn.commit.assert_not_called()
        self.conn.close.assert_called_once()

    def test_missing_user_returns_not_found(self):
        self.cursor.fetchone.return_value = None
        _, status = self.call('update_user_api', {'employee_code': 'NV001'}, 999)
        self.assertEqual(status, 404)
        self.conn.close.assert_called_once()

    def test_list_retains_api_aliases_and_returns_code(self):
        self.cursor.fetchall.return_value = [(7, 'guard', 'user', 'Guard', None, 'NV001')]
        response, status = self.call('get_users', {})
        self.assertEqual(status, 200)
        user = response.get_json()[0]
        self.assertEqual((user['id'], user['role'], user['employee_code']), (7, 'user', 'NV001'))


if __name__ == '__main__':
    unittest.main()
